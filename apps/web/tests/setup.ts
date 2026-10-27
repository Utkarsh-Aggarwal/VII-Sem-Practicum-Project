import { afterEach, beforeEach, vi } from "vitest";

// No test may reach the network. Each test can inspect `fetchMock` or give it its own implementation.
const ok = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
export const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(ok);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(ok);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

// Calls made to a URL containing `fragment`, with their parsed JSON bodies.
export function fetchCallsTo(fragment: string) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes(fragment))
    .map(([url, init]) => ({ url: String(url), init, body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body }));
}
