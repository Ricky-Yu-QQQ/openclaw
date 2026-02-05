import { describe, expect, it } from "vitest";
import { getFeishuRuntime, setFeishuRuntime } from "./runtime.js";

describe("feishu runtime", () => {
  it("throws when runtime not set", () => {
    expect(() => getFeishuRuntime()).toThrow("Feishu runtime not initialized");
  });

  it("returns runtime after set", () => {
    const runtime = { channel: { text: {} } } as any;
    setFeishuRuntime(runtime);
    expect(getFeishuRuntime()).toBe(runtime);
  });
});
