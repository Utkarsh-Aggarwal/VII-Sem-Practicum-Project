import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

const run = (path: string, cookie?: string) =>
  proxy(new NextRequest(`http://test.local${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} }));

describe("proxy (dashboard page guard)", () => {
  it("sends signed-out visitors to /login, remembering where they were going", () => {
    const res = run("/elders/abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://test.local/login?next=%2Felders%2Fabc");
    expect(run("/").headers.get("location")).toBe("http://test.local/login");
  });

  it("rejects a forged cookie", () => {
    expect(run("/", "forged.token").status).toBe(307);
  });

  it("lets signed-in caregivers through and bounces them off /login", () => {
    const token = createSessionToken("cg_1");
    expect(run("/", token).headers.get("x-middleware-next")).toBe("1");
    expect(run("/login", token).headers.get("location")).toBe("http://test.local/");
  });

  it("leaves the login and signup pages open", () => {
    expect(run("/login").headers.get("x-middleware-next")).toBe("1");
    expect(run("/signup").headers.get("x-middleware-next")).toBe("1");
  });
});
