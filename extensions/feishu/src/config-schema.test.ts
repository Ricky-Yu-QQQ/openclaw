import { describe, expect, it } from "vitest";
import { FeishuConfigSchema } from "./config-schema.js";

describe("FeishuConfigSchema", () => {
  it("applies defaults for optional fields", () => {
    const parsed = FeishuConfigSchema.parse({ appId: "app_1", appSecret: "secret_1" });

    expect(parsed.domain).toBe("feishu");
    expect(parsed.connectionMode).toBe("websocket");
    expect(parsed.dmPolicy).toBe("pairing");
    expect(parsed.groupPolicy).toBe("allowlist");
    expect(parsed.requireMention).toBe(true);
    expect(parsed.webhookPath).toBe("/feishu/events");
  });

  it("requires allowFrom wildcard when dmPolicy is open", () => {
    expect(() => FeishuConfigSchema.parse({ dmPolicy: "open" })).toThrow();

    const parsed = FeishuConfigSchema.parse({
      dmPolicy: "open",
      allowFrom: ["*"],
    });

    expect(parsed.allowFrom).toEqual(["*"]);
  });
});
