import { beforeEach, describe, expect, it, vi } from "vitest";

const listSpacesImpl = vi.fn();
const listNodesImpl = vi.fn();
const getNodeImpl = vi.fn();
const createNodeImpl = vi.fn();
const moveNodeImpl = vi.fn();
const renameNodeImpl = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    wiki: {
      space: {
        list: (...args: any[]) => listSpacesImpl(...args),
        getNode: (...args: any[]) => getNodeImpl(...args),
      },
      spaceNode: {
        list: (...args: any[]) => listNodesImpl(...args),
        create: (...args: any[]) => createNodeImpl(...args),
        move: (...args: any[]) => moveNodeImpl(...args),
        updateTitle: (...args: any[]) => renameNodeImpl(...args),
      },
    },
  })),
}));

import { registerFeishuWikiTools } from "./wiki.js";

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

describe("feishu wiki tools", () => {
  beforeEach(() => {
    listSpacesImpl.mockReset();
    listNodesImpl.mockReset();
    getNodeImpl.mockReset();
    createNodeImpl.mockReset();
    moveNodeImpl.mockReset();
    renameNodeImpl.mockReset();
  });

  it("skips when credentials missing", () => {
    const api = buildApi({ channels: { feishu: {} } });
    registerFeishuWikiTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("skips when wiki disabled", () => {
    const api = buildApi({
      channels: { feishu: { appId: "app", appSecret: "secret", tools: { wiki: false } } },
    });
    registerFeishuWikiTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("registers and executes wiki actions", async () => {
    const api = buildApi({
      channels: { feishu: { appId: "app", appSecret: "secret", tools: { wiki: true } } },
    });
    registerFeishuWikiTools(api);
    const tool = api.tools.feishu_wiki;

    listSpacesImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ space_id: "s1", name: "Space" }] },
    });
    const spaces = await tool.execute("id", { action: "spaces" });
    expect(spaces.details.spaces[0].space_id).toBe("s1");

    listNodesImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ node_token: "n1", obj_token: "o1", obj_type: "docx", title: "T" }] },
    });
    const nodes = await tool.execute("id", { action: "nodes", space_id: "s1" });
    expect(nodes.details.nodes[0].node_token).toBe("n1");

    getNodeImpl.mockResolvedValue({
      code: 0,
      data: { node: { node_token: "n1", space_id: "s1" } },
    });
    const get = await tool.execute("id", { action: "get", token: "n1" });
    expect(get.details.space_id).toBe("s1");

    createNodeImpl.mockResolvedValue({
      code: 0,
      data: { node: { node_token: "n2", obj_token: "o2", obj_type: "docx", title: "New" } },
    });
    const created = await tool.execute("id", { action: "create", space_id: "s1", title: "New" });
    expect(created.details.node_token).toBe("n2");

    moveNodeImpl.mockResolvedValue({ code: 0, data: { node: { node_token: "n2" } } });
    const moved = await tool.execute("id", { action: "move", space_id: "s1", node_token: "n2" });
    expect(moved.details.success).toBe(true);

    renameNodeImpl.mockResolvedValue({ code: 0 });
    const renamed = await tool.execute("id", {
      action: "rename",
      space_id: "s1",
      node_token: "n2",
      title: "Renamed",
    });
    expect(renamed.details.title).toBe("Renamed");

    const search = await tool.execute("id", { action: "search" });
    expect(search.details.error).toContain("Search is not available");
  });

  it("returns error on unknown action", async () => {
    const api = buildApi({
      channels: { feishu: { appId: "app", appSecret: "secret", tools: { wiki: true } } },
    });
    registerFeishuWikiTools(api);
    const res = await api.tools.feishu_wiki.execute("id", { action: "unknown" });
    expect(res.details.error).toContain("Unknown action");
  });
});
