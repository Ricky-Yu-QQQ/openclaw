import { describe, it, expect, vi } from "vitest";

vi.mock("@larksuiteoapi/node-sdk", () => ({
  Client: vi.fn(() => ({})),
  WSClient: vi.fn(() => ({ start: vi.fn() })),
  EventDispatcher: vi.fn(() => ({ register: vi.fn(() => ({})) })),
  LoggerLevel: { error: "error" },
}));

import { feishuPlugin } from "../src/channel.js";

describe("feishu plugin metadata", () => {
  it("uses the openclaw repo docs link", () => {
    expect(feishuPlugin.meta.docsPath).toBe("https://github.com/Ricky-Yu-QQQ/openclaw");
  });

  it("does not expose channel actions directly", () => {
    expect((feishuPlugin as any).actions).toBeUndefined();
  });
});

describe("feishu account resolution", () => {
  it("returns empty credentials when config is missing", () => {
    const account = feishuPlugin.config.resolveAccount({} as any, "default");
    expect(account).toBeDefined();
    expect(account?.appId).toBe("");
    expect(account?.appSecret).toBe("");
    expect(account?.config.enabled).toBe(false);
  });

  it("returns configured credentials when present", () => {
    const account = feishuPlugin.config.resolveAccount(
      { channels: { feishu: { appId: "app_1", appSecret: "secret_1" } } } as any,
      "default"
    );
    expect(account?.appId).toBe("app_1");
    expect(account?.appSecret).toBe("secret_1");
  });
});
