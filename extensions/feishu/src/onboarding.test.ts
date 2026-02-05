import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

vi.mock("./probe.js", () => ({
  probeFeishu: vi.fn().mockResolvedValue({ ok: true, botName: "Bot" }),
}));

import { feishuOnboardingAdapter } from "./onboarding.js";
import { probeFeishu } from "./probe.js";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";

function createPrompter(responses: {
  text?: string[];
  confirm?: boolean[];
  select?: string[];
}) {
  const textQueue = [...(responses.text ?? [])];
  const confirmQueue = [...(responses.confirm ?? [])];
  const selectQueue = [...(responses.select ?? [])];
  return {
    note: vi.fn(),
    text: vi.fn(async () => textQueue.shift()),
    confirm: vi.fn(async () => confirmQueue.shift()),
    select: vi.fn(async () => selectQueue.shift()),
  } as any;
}

describe("feishu onboarding", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports status when not configured", async () => {
    const cfg = { channels: {} } as ClawdbotConfig;
    const status = await feishuOnboardingAdapter.getStatus({ cfg });
    expect(status.configured).toBe(false);
    expect(status.statusLines.join(" ")).toContain("needs app credentials");
  });

  it("reports configured status when probe succeeds", async () => {
    const cfg = { channels: { feishu: { appId: "app", appSecret: "secret" } } } as ClawdbotConfig;
    const status = await feishuOnboardingAdapter.getStatus({ cfg });
    expect(status.configured).toBe(true);
    expect(status.statusLines.join(" ")).toContain("connected");
  });

  it("configures using env credentials", async () => {
    vi.stubEnv("FEISHU_APP_ID", "env_app");
    vi.stubEnv("FEISHU_APP_SECRET", "env_secret");

    const cfg = { channels: {} } as ClawdbotConfig;
    const prompter = createPrompter({
      confirm: [true],
      select: ["lark", "open"],
    });

    const res = await feishuOnboardingAdapter.configure({ cfg, prompter });
    expect(res.accountId).toBe(DEFAULT_ACCOUNT_ID);
    expect(res.cfg.channels?.feishu?.enabled).toBe(true);
    expect(res.cfg.channels?.feishu?.domain).toBe("lark");
    expect(res.cfg.channels?.feishu?.groupPolicy).toBe("open");
  });

  it("configures with manual credentials and allowlist", async () => {
    const cfg = { channels: { feishu: { appId: "old", appSecret: "old" } } } as ClawdbotConfig;
    const prompter = createPrompter({
      confirm: [false],
      text: ["app_id", "app_secret", "oc_1, oc_2"],
      select: ["feishu", "allowlist"],
    });

    const res = await feishuOnboardingAdapter.configure({ cfg, prompter });
    expect(res.cfg.channels?.feishu?.appId).toBe("app_id");
    expect(res.cfg.channels?.feishu?.appSecret).toBe("app_secret");
    expect(res.cfg.channels?.feishu?.groupAllowFrom).toEqual(["oc_1", "oc_2"]);
  });

  it("keeps existing credentials when confirmed", async () => {
    const cfg = { channels: { feishu: { appId: "old", appSecret: "old" } } } as ClawdbotConfig;
    const prompter = createPrompter({
      confirm: [true],
      select: ["feishu", "open"],
    });

    const res = await feishuOnboardingAdapter.configure({ cfg, prompter });
    expect(res.cfg.channels?.feishu?.appId).toBe("old");
    expect(res.cfg.channels?.feishu?.groupPolicy).toBe("open");
  });

  it("prompts for DM allowlist entries", async () => {
    const cfg = { channels: { feishu: {} } } as ClawdbotConfig;
    const prompter = createPrompter({
      text: ["ou_1, ou_2"],
    });

    const next = await feishuOnboardingAdapter.dmPolicy.promptAllowFrom({
      cfg,
      prompter,
    });
    expect(next.channels?.feishu?.allowFrom).toEqual(["ou_1", "ou_2"]);
  });

  it("notes probe failures during configure", async () => {
    vi.mocked(probeFeishu).mockResolvedValueOnce({ ok: false, error: "nope" } as any);

    const cfg = { channels: {} } as ClawdbotConfig;
    const prompter = createPrompter({
      text: ["app_id", "app_secret"],
      select: ["feishu", "open"],
    });

    await feishuOnboardingAdapter.configure({ cfg, prompter });
    expect(prompter.note).toHaveBeenCalled();
  });
});
