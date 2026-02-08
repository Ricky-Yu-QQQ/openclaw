import { beforeEach, describe, expect, it, vi } from "vitest";

let rawContentRes: any;
let docInfoRes: any;
let blockListRes: any;
let convertRes: any;
let blockChildrenCreateRes: any;
let blockChildrenBatchDeleteRes: any;
let blockChildrenGetRes: any;
let blockGetRes: any;
let blockPatchRes: any;
let docCreateRes: any;
let uploadAllRes: any;
let scopeListRes: any;

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    docx: {
      document: {
        rawContent: () => rawContentRes,
        get: () => docInfoRes,
        convert: () => convertRes,
        create: () => docCreateRes,
      },
      documentBlock: {
        list: () => blockListRes,
        get: () => blockGetRes,
        patch: () => blockPatchRes,
      },
      documentBlockChildren: {
        create: () => blockChildrenCreateRes,
        batchDelete: () => blockChildrenBatchDeleteRes,
        get: () => blockChildrenGetRes,
      },
    },
    drive: {
      media: { uploadAll: () => uploadAllRes },
    },
    application: {
      scope: { list: () => scopeListRes },
    },
  })),
}));

import { registerFeishuDocTools } from "./docx.js";
import { setFeishuRuntime } from "./runtime.js";

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

describe("feishu doc tools", () => {
  beforeEach(() => {
    rawContentRes = { code: 0, data: { content: "Hello" } };
    docInfoRes = { code: 0, data: { document: { title: "Doc", revision_id: "rev" } } };
    blockListRes = {
      code: 0,
      data: {
        items: [
          { block_type: 2, parent_id: "doc", block_id: "b1" },
          { block_type: 27, parent_id: "doc", block_id: "b2" },
        ],
      },
    };
    convertRes = {
      code: 0,
      data: {
        blocks: [{ block_type: 2 }, { block_type: 27, block_id: "b2" }, { block_type: 31 }],
        first_level_block_ids: ["b1"],
      },
    };
    blockChildrenCreateRes = { code: 0, data: { children: [{ block_id: "b2", block_type: 27 }] } };
    blockChildrenBatchDeleteRes = { code: 0 };
    blockChildrenGetRes = { code: 0, data: { items: [{ block_id: "b2" }, { block_id: "b3" }] } };
    blockGetRes = { code: 0, data: { block: { parent_id: "doc" } } };
    blockPatchRes = { code: 0 };
    docCreateRes = { code: 0, data: { document: { document_id: "doc", title: "New" } } };
    uploadAllRes = { file_token: "file_token" };
    scopeListRes = {
      code: 0,
      data: { scopes: [{ scope_name: "im:message", scope_type: "app", grant_status: 1 }] },
    };

    setFeishuRuntime({
      channel: {
        media: {
          fetchRemoteMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from("img") }),
        },
      },
    } as any);
  });

  it("skips when credentials missing", () => {
    const api = buildApi({ channels: { feishu: {} } });
    registerFeishuDocTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("registers and executes doc actions", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuDocTools(api);

    const docTool = api.tools.feishu_doc;
    const scopesTool = api.tools.feishu_app_scopes;

    const read = await docTool.execute("id", { action: "read", doc_token: "doc" });
    expect(read.details.title).toBe("Doc");
    expect(read.details.hint).toContain("NOT included");

    const write = await docTool.execute("id", {
      action: "write",
      doc_token: "doc",
      content: "![img](https://x/img.png)",
    });
    expect(write.details.success).toBe(true);
    expect(write.details.warning).toContain("Skipped unsupported block types");

    const append = await docTool.execute("id", {
      action: "append",
      doc_token: "doc",
      content: "text",
    });
    expect(append.details.blocks_added).toBeGreaterThan(0);

    const created = await docTool.execute("id", { action: "create", title: "New" });
    expect(created.details.document_id).toBe("doc");

    const list = await docTool.execute("id", { action: "list_blocks", doc_token: "doc" });
    expect(list.details.blocks.length).toBeGreaterThan(0);

    const get = await docTool.execute("id", {
      action: "get_block",
      doc_token: "doc",
      block_id: "b2",
    });
    expect(get.details.block).toBeDefined();

    const update = await docTool.execute("id", {
      action: "update_block",
      doc_token: "doc",
      block_id: "b2",
      content: "hi",
    });
    expect(update.details.success).toBe(true);

    const del = await docTool.execute("id", {
      action: "delete_block",
      doc_token: "doc",
      block_id: "b2",
    });
    expect(del.details.success).toBe(true);

    const scopes = await scopesTool.execute("id", {});
    expect(scopes.details.summary).toContain("granted");
  });

  it("returns error on unknown action", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuDocTools(api);
    const res = await api.tools.feishu_doc.execute("id", { action: "unknown" });
    expect(res.details.error).toContain("Unknown action");
  });

  it("returns error on empty append", async () => {
    convertRes = { code: 0, data: { blocks: [] } };

    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuDocTools(api);

    const res = await api.tools.feishu_doc.execute("id", {
      action: "append",
      doc_token: "doc",
      content: "",
    });
    expect(res.details.error).toContain("Content is empty");
  });
});
