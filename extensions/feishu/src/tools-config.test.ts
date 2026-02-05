import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLS_CONFIG, resolveToolsConfig } from "./tools-config.js";

describe("tools-config", () => {
  it("uses defaults when no config is provided", () => {
    expect(resolveToolsConfig()).toEqual(DEFAULT_TOOLS_CONFIG);
  });

  it("overrides defaults with provided values", () => {
    expect(resolveToolsConfig({ doc: false, perm: true })).toEqual({
      ...DEFAULT_TOOLS_CONFIG,
      doc: false,
      perm: true,
    });
  });
});
