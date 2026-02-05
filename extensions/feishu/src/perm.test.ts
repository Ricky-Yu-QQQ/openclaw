import { beforeEach, describe, expect, it, vi } from "vitest";

const listImpl = vi.fn();
const addImpl = vi.fn();
const removeImpl = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    drive: { permissionMember: { list: (...args: any[]) => listImpl(...args), create: (...args: any[]) => addImpl(...args), delete: (...args: any[]) => removeImpl(...args) } },
  })),
}));

import { registerFeishuPermTools } from "./perm.js";

function buildApi(cfg: any) {
  const tools: Record<string, any> = {};
  return {
    config: cfg,
    logger: { debug: vi.fn(), info: vi.fn() },
    registerTool: (tool: any) => {
      tools[tool.name] = tool;
    },
    tools,
  } as any;
}

describe("feishu perm tools", () => {
  beforeEach(() => {
    listImpl.mockReset();
    addImpl.mockReset();
    removeImpl.mockReset();
  });

  it("skips when credentials missing", () => {
    const api = buildApi({ channels: { feishu: {} } });
    registerFeishuPermTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("skips when perm disabled", () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret", tools: { perm: false } } } });
    registerFeishuPermTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("registers and executes perm actions", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret", tools: { perm: true } } } });
    registerFeishuPermTools(api);
    const tool = api.tools.feishu_perm;

    listImpl.mockResolvedValue({ code: 0, data: { items: [{ member_type: "openid", member_id: "ou_1", perm: "view", name: "A" }] } });
    const listRes = await tool.execute("id", { action: "list", token: "t", type: "doc" });
    expect(listRes.details.members[0].member_id).toBe("ou_1");

    addImpl.mockResolvedValue({ code: 0, data: { member: { member_id: "ou_1" } } });
    const addRes = await tool.execute("id", { action: "add", token: "t", type: "doc", member_type: "openid", member_id: "ou_1", perm: "view" });
    expect(addRes.details.success).toBe(true);

    removeImpl.mockResolvedValue({ code: 0 });
    const removeRes = await tool.execute("id", { action: "remove", token: "t", type: "doc", member_type: "openid", member_id: "ou_1" });
    expect(removeRes.details.success).toBe(true);
  });

  it("returns error on unknown action", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret", tools: { perm: true } } } });
    registerFeishuPermTools(api);
    const res = await api.tools.feishu_perm.execute("id", { action: "unknown" });
    expect(res.details.error).toContain("Unknown action");
  });
});
