// Thin, dependency-free LLM adapter. The companion only needs "system prompt + short history in,
// one short reply out", so we talk to the providers' HTTP APIs directly with fetch.
// Returns null on any failure so callers can fall back to the offline companion.

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

type Provider = { name: string; call: (messages: LlmMessage[], opts: LlmOptions) => Promise<string | null> };

export type LlmOptions = { maxTokens?: number; temperature?: number; json?: boolean };

const TIMEOUT_MS = 15_000;

async function postJson(url: string, body: unknown, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Groq's current chat models "think" before answering; without these settings the hidden reasoning
// can use up the short reply budget and the answer comes back empty.
function groqReasoningParams(model: string): Record<string, unknown> {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low", include_reasoning: false };
  if (model.startsWith("qwen/")) return { reasoning_format: "hidden" };
  return {};
}

function openAiCompatible(name: string, baseUrl: string, apiKey: string, model: string, extra: Record<string, unknown> = {}): Provider {
  return {
    name,
    async call(messages, opts) {
      const data = await postJson(
        `${baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          model,
          messages,
          max_tokens: opts.maxTokens ?? 160,
          temperature: opts.temperature ?? 0.8,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          ...extra,
        },
        apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
      );
      return data?.choices?.[0]?.message?.content ?? null;
    },
  };
}

function gemini(apiKey: string, model: string): Provider {
  return {
    name: "gemini",
    async call(messages, opts) {
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const data = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: {
            maxOutputTokens: opts.maxTokens ?? 160,
            temperature: opts.temperature ?? 0.8,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        },
        { "x-goog-api-key": apiKey }
      );
      const parts = data?.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
      return parts?.map((p) => p.text ?? "").join("") || null;
    },
  };
}

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): Provider | null {
  const wanted = (env.LLM_PROVIDER || "").toLowerCase();
  const groq = () => {
    if (!env.GROQ_API_KEY) return null;
    const model = env.GROQ_MODEL || "openai/gpt-oss-120b";
    return openAiCompatible("groq", "https://api.groq.com/openai/v1", env.GROQ_API_KEY, model, groqReasoningParams(model));
  };
  const gem = () => (env.GEMINI_API_KEY ? gemini(env.GEMINI_API_KEY, env.GEMINI_MODEL || "gemini-2.5-flash") : null);
  const compat = () =>
    env.LLM_BASE_URL && env.LLM_MODEL
      ? openAiCompatible("openai-compatible", env.LLM_BASE_URL, env.LLM_API_KEY || "", env.LLM_MODEL)
      : null;

  if (wanted === "groq") return groq();
  if (wanted === "gemini") return gem();
  if (wanted === "openai-compatible") return compat();
  return groq() ?? gem() ?? compat();
}

export function llmConfigured() {
  return resolveProvider() !== null;
}

export async function complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string | null> {
  const provider = resolveProvider();
  if (!provider) return null;
  try {
    const text = await provider.call(messages, opts);
    // Some reasoning models inline their thinking as <think>…</think>; never show that to the senior.
    return text?.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim() || null;
  } catch (err) {
    console.warn(`[llm:${provider.name}] falling back to offline reply:`, (err as Error).message);
    return null;
  }
}
