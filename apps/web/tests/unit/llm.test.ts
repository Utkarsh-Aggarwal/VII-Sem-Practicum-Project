import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, resolveProvider } from "@/lib/ai/llm";
import { fetchMock } from "../setup";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

afterEach(() => vi.unstubAllEnvs());

describe("provider resolution", () => {
  it("is null without keys (offline companion)", () => {
    expect(resolveProvider({} as NodeJS.ProcessEnv)).toBeNull();
  });
  it("prefers groq, then gemini, then openai-compatible", () => {
    expect(resolveProvider({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m" } as unknown as NodeJS.ProcessEnv)?.name).toBe("groq");
    expect(resolveProvider({ GEMINI_API_KEY: "m" } as unknown as NodeJS.ProcessEnv)?.name).toBe("gemini");
    expect(resolveProvider({ LLM_BASE_URL: "http://x", LLM_MODEL: "m" } as unknown as NodeJS.ProcessEnv)?.name).toBe("openai-compatible");
  });
  it("honours an explicit LLM_PROVIDER", () => {
    expect(resolveProvider({ LLM_PROVIDER: "gemini", GROQ_API_KEY: "g", GEMINI_API_KEY: "m" } as unknown as NodeJS.ProcessEnv)?.name).toBe("gemini");
    expect(resolveProvider({ LLM_PROVIDER: "gemini", GROQ_API_KEY: "g" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("complete()", () => {
  const messages = [
    { role: "system" as const, content: "be brief" },
    { role: "user" as const, content: "hello" },
  ];

  it("returns null without a provider and makes no request", async () => {
    expect(await complete(messages)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Groq's OpenAI-compatible endpoint", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    fetchMock.mockResolvedValueOnce(json({ choices: [{ message: { content: "  Hi there!  " } }] }));
    expect(await complete(messages, { maxTokens: 50 })).toBe("Hi there!");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer gk");
    const body = JSON.parse(init!.body as string);
    expect(body.messages).toEqual(messages);
    expect(body.max_tokens).toBe(50);
  });

  it("maps roles and system prompt for Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "mk");
    fetchMock.mockResolvedValueOnce(json({ candidates: [{ content: { parts: [{ text: "Namaste" }] } }] }));
    const out = await complete([...messages, { role: "assistant", content: "earlier" }, { role: "user", content: "again" }]);
    expect(out).toBe("Namaste");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(":generateContent");
    const body = JSON.parse(init!.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("be brief");
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("falls back (null) on HTTP errors and network failures", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    expect(await complete(messages)).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await complete(messages)).toBeNull();
  });
});

describe("Groq reasoning models", () => {
  it("uses hidden reasoning for qwen models", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    vi.stubEnv("GROQ_MODEL", "qwen/qwen3.8-27b");
    fetchMock.mockResolvedValueOnce(json({ choices: [{ message: { content: "Namaste!" } }] }));
    await complete([{ role: "user", content: "hi" }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.model).toBe("qwen/qwen3.8-27b");
    expect(body.reasoning_format).toBe("hidden");
  });

  it("defaults to gpt-oss-120b with low reasoning effort", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    vi.stubEnv("GROQ_MODEL", "");
    fetchMock.mockResolvedValueOnce(json({ choices: [{ message: { content: "Hi" } }] }));
    await complete([{ role: "user", content: "hi" }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ model: "openai/gpt-oss-120b", reasoning_effort: "low", include_reasoning: false });
  });

  it("strips inline <think> blocks", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    fetchMock.mockResolvedValueOnce(json({ choices: [{ message: { content: "<think>he seems sad</think>I'm here with you." } }] }));
    expect(await complete([{ role: "user", content: "hi" }])).toBe("I'm here with you.");
  });
});
