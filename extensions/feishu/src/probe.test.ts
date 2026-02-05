import { describe, expect, it, beforeEach, vi } from "vitest";

let requestImpl: any;

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    request: (...args: any[]) => requestImpl(...args),
  })),
}));

import { probeFeishu } from "./probe.js";

const cfg = { appId: "app", appSecret: "secret" } as any;

describe("feishu probe", () => {
  beforeEach(() => {
    requestImpl = vi.fn();
  });

  it("returns missing credentials error", async () => {
    const res = await probeFeishu(undefined);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("missing credentials");
  });

  it("returns bot info on success", async () => {
    requestImpl = vi.fn().mockResolvedValue({ code: 0, bot: { bot_name: "Bot", open_id: "ou_1" } });

    const res = await probeFeishu(cfg);
    expect(res.ok).toBe(true);
    expect(res.botName).toBe("Bot");
    expect(res.botOpenId).toBe("ou_1");
  });

  it("returns error on api failure", async () => {
    requestImpl = vi.fn().mockResolvedValue({ code: 2, msg: "bad" });

    const res = await probeFeishu(cfg);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("API error");
  });

  it("returns error on thrown exception", async () => {
    requestImpl = vi.fn().mockRejectedValue(new Error("boom"));

    const res = await probeFeishu(cfg);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("boom");
  });
});
