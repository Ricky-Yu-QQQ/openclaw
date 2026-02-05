import { describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

const sendMessageFeishu = vi.fn();
vi.mock("./send.js", () => ({
  sendMessageFeishu: (...args: any[]) => sendMessageFeishu(...args),
}));

vi.mock("./directory.js", () => ({
  listFeishuDirectoryPeers: vi.fn().mockResolvedValue([{ id: "ou_1" }]),
  listFeishuDirectoryGroups: vi.fn().mockResolvedValue([{ id: "oc_1" }]),
  listFeishuDirectoryPeersLive: vi.fn().mockResolvedValue([{ id: "ou_live" }]),
  listFeishuDirectoryGroupsLive: vi.fn().mockResolvedValue([{ id: "oc_live" }]),
}));

const monitorFeishuProvider = vi.fn().mockResolvedValue(undefined);
vi.mock("./monitor.js", () => ({
  monitorFeishuProvider: (...args: any[]) => monitorFeishuProvider(...args),
}));

import { feishuPlugin } from "./channel.js";

const cfg: ClawdbotConfig = {
  channels: { feishu: { appId: "app", appSecret: "secret" } },
} as ClawdbotConfig;

describe("feishu channel plugin", () => {
  it("exposes meta and pairing helpers", async () => {
    expect(feishuPlugin.meta.id).toBe("feishu");
    expect(feishuPlugin.pairing.normalizeAllowEntry("feishu:ou_1")).toBe("ou_1");

    await feishuPlugin.pairing.notifyApproval({ cfg, id: "ou_1" } as any);
    expect(sendMessageFeishu).toHaveBeenCalled();
  });

  it("config helpers manipulate config", () => {
    expect(feishuPlugin.config.listAccountIds()).toEqual(["default"]);
    expect(feishuPlugin.config.defaultAccountId()).toBe("default");

    const account = feishuPlugin.config.resolveAccount(cfg);
    expect(account.configured).toBe(true);

    const enabled = feishuPlugin.config.setAccountEnabled({ cfg, enabled: false });
    expect(enabled.channels?.feishu?.enabled).toBe(false);

    const deleted = feishuPlugin.config.deleteAccount({ cfg });
    expect(deleted.channels?.feishu).toBeUndefined();

    const allowFrom = feishuPlugin.config.resolveAllowFrom({ cfg });
    expect(allowFrom).toEqual([]);
    const formatted = feishuPlugin.config.formatAllowFrom({ allowFrom: [" OU_1 ", " "] });
    expect(formatted).toEqual(["ou_1"]);
  });

  it("collects security warnings", () => {
    const openCfg = { channels: { feishu: { appId: "app", appSecret: "secret", groupPolicy: "open" } } } as ClawdbotConfig;
    const warnings = feishuPlugin.security?.collectWarnings?.({ cfg: openCfg } as any) ?? [];
    expect(warnings[0]).toContain("groupPolicy=\"open\"");
  });

  it("directory helpers call adapters", async () => {
    const peers = await feishuPlugin.directory?.listPeers?.({ cfg, query: "", limit: 10 } as any);
    const groups = await feishuPlugin.directory?.listGroups?.({ cfg, query: "", limit: 10 } as any);
    const peersLive = await feishuPlugin.directory?.listPeersLive?.({ cfg, query: "", limit: 10 } as any);
    const groupsLive = await feishuPlugin.directory?.listGroupsLive?.({ cfg, query: "", limit: 10 } as any);

    expect(peers?.[0].id).toBe("ou_1");
    expect(groups?.[0].id).toBe("oc_1");
    expect(peersLive?.[0].id).toBe("ou_live");
    expect(groupsLive?.[0].id).toBe("oc_live");
  });

  it("starts gateway monitor", async () => {
    await feishuPlugin.gateway?.startAccount?.({
      cfg,
      runtime: {},
      accountId: "default",
      setStatus: vi.fn(),
      abortSignal: new AbortController().signal,
      log: { info: vi.fn() },
    } as any);

    expect(monitorFeishuProvider).toHaveBeenCalled();
  });
});
