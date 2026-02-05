import { beforeEach, describe, expect, it, vi } from "vitest";

const listImpl = vi.fn();
const createFolderImpl = vi.fn();
const moveImpl = vi.fn();
const deleteImpl = vi.fn();
const httpGetImpl = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    drive: { file: { list: (...args: any[]) => listImpl(...args), createFolder: (...args: any[]) => createFolderImpl(...args), move: (...args: any[]) => moveImpl(...args), delete: (...args: any[]) => deleteImpl(...args) } },
    httpInstance: { get: (...args: any[]) => httpGetImpl(...args) },
    domain: "https://open.feishu.cn",
  })),
}));

import { registerFeishuDriveTools } from "./drive.js";

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

describe("feishu drive tools", () => {
  beforeEach(() => {
    listImpl.mockReset();
    createFolderImpl.mockReset();
    moveImpl.mockReset();
    deleteImpl.mockReset();
    httpGetImpl.mockReset();
  });

  it("skips when credentials missing", () => {
    const api = buildApi({ channels: { feishu: {} } });
    registerFeishuDriveTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("skips when drive disabled", () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret", tools: { drive: false } } } });
    registerFeishuDriveTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("registers and executes drive actions", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret", tools: { drive: true } } } });
    registerFeishuDriveTools(api);

    const tool = api.tools.feishu_drive;
    expect(tool).toBeDefined();

    listImpl.mockResolvedValue({ code: 0, data: { files: [{ token: "t1", name: "A", type: "file" }], next_page_token: "n" } });
    const listRes = await tool.execute("id", { action: "list" });
    expect(listRes.details.files[0].token).toBe("t1");

    listImpl.mockResolvedValue({ code: 0, data: { files: [{ token: "t2", name: "B", type: "file" }] } });
    const infoRes = await tool.execute("id", { action: "info", file_token: "t2", folder_token: "f" });
    expect(infoRes.details.token).toBe("t2");

    httpGetImpl.mockResolvedValue({ code: 0, data: { token: "root" } });
    createFolderImpl.mockResolvedValue({ code: 0, data: { token: "new", url: "u" } });
    const createRes = await tool.execute("id", { action: "create_folder", name: "Folder" });
    expect(createRes.details.token).toBe("new");

    moveImpl.mockResolvedValue({ code: 0, data: { task_id: "task" } });
    const moveRes = await tool.execute("id", { action: "move", file_token: "t1", type: "doc", folder_token: "f" });
    expect(moveRes.details.task_id).toBe("task");

    deleteImpl.mockResolvedValue({ code: 0, data: { task_id: "task" } });
    const deleteRes = await tool.execute("id", { action: "delete", file_token: "t1", type: "doc" });
    expect(deleteRes.details.success).toBe(true);
  });

  it("returns error on unknown action", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret", tools: { drive: true } } } });
    registerFeishuDriveTools(api);
    const res = await api.tools.feishu_drive.execute("id", { action: "unknown" });
    expect(res.details.error).toContain("Unknown action");
  });
});
