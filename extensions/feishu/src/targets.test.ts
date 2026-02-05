import { describe, expect, it } from "vitest";
import {
  detectIdType,
  formatFeishuTarget,
  looksLikeFeishuId,
  normalizeFeishuTarget,
  resolveReceiveIdType,
} from "./targets.js";

describe("feishu targets", () => {
  it("detects id types", () => {
    expect(detectIdType("oc_123")).toBe("chat_id");
    expect(detectIdType("ou_123")).toBe("open_id");
    expect(detectIdType("user_123")).toBe("user_id");
    expect(detectIdType("!bad")).toBeNull();
  });

  it("normalizes targets", () => {
    expect(normalizeFeishuTarget(" chat:oc_1 ")).toBe("oc_1");
    expect(normalizeFeishuTarget("user:ou_1")).toBe("ou_1");
    expect(normalizeFeishuTarget("open_id:ou_2")).toBe("ou_2");
    expect(normalizeFeishuTarget("ou_3")).toBe("ou_3");
    expect(normalizeFeishuTarget("   ")).toBeNull();
  });

  it("formats targets", () => {
    expect(formatFeishuTarget("oc_1")).toBe("chat:oc_1");
    expect(formatFeishuTarget("ou_1")).toBe("user:ou_1");
    expect(formatFeishuTarget("user_1")).toBe("user_1");
    expect(formatFeishuTarget("user_1", "chat_id")).toBe("chat:user_1");
  });

  it("resolves receive id type", () => {
    expect(resolveReceiveIdType("oc_1")).toBe("chat_id");
    expect(resolveReceiveIdType("ou_1")).toBe("open_id");
    expect(resolveReceiveIdType("user_1")).toBe("open_id");
  });

  it("detects feishu id patterns", () => {
    expect(looksLikeFeishuId("chat:oc_1")).toBe(true);
    expect(looksLikeFeishuId("user:ou_1")).toBe(true);
    expect(looksLikeFeishuId("open_id:ou_1")).toBe(true);
    expect(looksLikeFeishuId("oc_1")).toBe(true);
    expect(looksLikeFeishuId("ou_1")).toBe(true);
    expect(looksLikeFeishuId(" ")).toBe(false);
  });
});
