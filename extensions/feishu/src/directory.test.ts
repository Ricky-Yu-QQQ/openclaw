import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

let userListImpl: any;
let chatListImpl: any;

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    contact: { user: { list: (...args: any[]) => userListImpl(...args) } },
    im: { chat: { list: (...args: any[]) => chatListImpl(...args) } },
  })),
}));

import {
  listFeishuDirectoryGroups,
  listFeishuDirectoryGroupsLive,
  listFeishuDirectoryPeers,
  listFeishuDirectoryPeersLive,
} from "./directory.js";

describe("feishu directory", () => {
  beforeEach(() => {
    userListImpl = vi.fn();
    chatListImpl = vi.fn();
  });

  it("lists peers from allowlist and dms", async () => {
    const cfg = {
      channels: {
        feishu: {
          allowFrom: ["*", " user:ou_1 ", "ou_2"],
          dms: { "ou_3": {} },
        },
      },
    } as ClawdbotConfig;

    const peers = await listFeishuDirectoryPeers({ cfg });
    expect(peers).toEqual([
      { kind: "user", id: "ou_1" },
      { kind: "user", id: "ou_2" },
      { kind: "user", id: "ou_3" },
    ]);
  });

  it("lists groups from config and allowlist", async () => {
    const cfg = {
      channels: {
        feishu: {
          groups: { "oc_1": {}, " * ": {} },
          groupAllowFrom: ["oc_2", "*"],
        },
      },
    } as ClawdbotConfig;

    const groups = await listFeishuDirectoryGroups({ cfg });
    expect(groups).toEqual([
      { kind: "group", id: "oc_1" },
      { kind: "group", id: "oc_2" },
    ]);
  });

  it("falls back to local peers when credentials missing", async () => {
    const cfg = {
      channels: { feishu: { allowFrom: ["ou_1"] } },
    } as ClawdbotConfig;

    const peers = await listFeishuDirectoryPeersLive({ cfg, query: "ou" });
    expect(peers).toEqual([{ kind: "user", id: "ou_1" }]);
  });

  it("loads peers from api and filters by query", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret" } },
    } as ClawdbotConfig;

    userListImpl = vi.fn().mockResolvedValue({
      code: 0,
      data: { items: [{ open_id: "ou_1", name: "Alice" }, { open_id: "ou_2", name: "Bob" }] },
    });

    const peers = await listFeishuDirectoryPeersLive({ cfg, query: "ali" });
    expect(peers).toEqual([{ kind: "user", id: "ou_1", name: "Alice" }]);
  });

  it("falls back to local groups when api fails", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", groupAllowFrom: ["oc_9"] } },
    } as ClawdbotConfig;

    chatListImpl = vi.fn().mockRejectedValue(new Error("boom"));

    const groups = await listFeishuDirectoryGroupsLive({ cfg });
    expect(groups).toEqual([{ kind: "group", id: "oc_9" }]);
  });

  it("loads groups from api and filters", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret" } },
    } as ClawdbotConfig;

    chatListImpl = vi.fn().mockResolvedValue({
      code: 0,
      data: { items: [{ chat_id: "oc_1", name: "Alpha" }, { chat_id: "oc_2", name: "Beta" }] },
    });

    const groups = await listFeishuDirectoryGroupsLive({ cfg, query: "beta" });
    expect(groups).toEqual([{ kind: "group", id: "oc_2", name: "Beta" }]);
  });
});
