import { beforeEach, describe, expect, it } from "vitest";
import { call, makeCaregiver, makeElder, req, resetDb } from "../helpers";
import * as elders from "@/app/api/elders/route";

describe("harness", () => {
  beforeEach(resetDb);
  it("calls a route handler against the test DB", async () => {
    const { caregiver, token } = await makeCaregiver();
    await makeElder(caregiver.id);
    const res = await call(elders.GET, req("GET", "/api/elders", { cookie: token }));
    expect(res.status).toBe(200);
    expect(res.json.elders).toHaveLength(1);
  });
});
