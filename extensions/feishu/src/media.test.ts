import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadWebMedia } = vi.hoisted(() => ({ loadWebMedia: vi.fn() }));
vi.mock("openclaw/plugin-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk")>();
  return { ...actual, loadWebMedia };
});

let imageGetResponse: any;
let resourceGetResponse: any;
let imageCreateResponse: any;
let fileCreateResponse: any;
let messageCreateResponse: any;
let messageReplyResponse: any;

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    im: {
      image: {
        get: () => imageGetResponse,
        create: () => imageCreateResponse,
      },
      messageResource: {
        get: () => resourceGetResponse,
      },
      file: {
        create: () => fileCreateResponse,
      },
      message: {
        create: () => messageCreateResponse,
        reply: () => messageReplyResponse,
      },
    },
  })),
}));

import {
  detectFileType,
  downloadImageFeishu,
  downloadMessageResourceFeishu,
  sendFileFeishu,
  sendImageFeishu,
  sendMediaFeishu,
  uploadFileFeishu,
  uploadImageFeishu,
} from "./media.js";

const cfg: ClawdbotConfig = {
  channels: { feishu: { appId: "app", appSecret: "secret" } },
} as ClawdbotConfig;

describe("feishu media", () => {
  beforeEach(() => {
    imageGetResponse = undefined;
    resourceGetResponse = undefined;
    imageCreateResponse = undefined;
    fileCreateResponse = undefined;
    messageCreateResponse = { code: 0, data: { message_id: "m1" } };
    messageReplyResponse = { code: 0, data: { message_id: "m2" } };
    loadWebMedia.mockReset();
  });

  it("detects file types", () => {
    expect(detectFileType("a.opus")).toBe("opus");
    expect(detectFileType("a.mp4")).toBe("mp4");
    expect(detectFileType("a.pdf")).toBe("pdf");
    expect(detectFileType("a.docx")).toBe("doc");
    expect(detectFileType("a.xlsx")).toBe("xls");
    expect(detectFileType("a.pptx")).toBe("ppt");
    expect(detectFileType("a.bin")).toBe("stream");
  });

  it("downloads image from buffer and arraybuffer", async () => {
    imageGetResponse = Buffer.from("img");
    const res1 = await downloadImageFeishu({ cfg, imageKey: "img" });
    expect(res1.buffer.toString()).toBe("img");

    imageGetResponse = new ArrayBuffer(3);
    const res2 = await downloadImageFeishu({ cfg, imageKey: "img" });
    expect(res2.buffer.length).toBe(3);

    imageGetResponse = { data: new ArrayBuffer(2) };
    const res3 = await downloadImageFeishu({ cfg, imageKey: "img" });
    expect(res3.buffer.length).toBe(2);
  });

  it("downloads image using getReadableStream/writeFile", async () => {
    imageGetResponse = {
      getReadableStream() {
        return (async function* () {
          yield Buffer.from("a");
          yield Buffer.from("b");
        })();
      },
    };
    const res1 = await downloadImageFeishu({ cfg, imageKey: "img" });
    expect(res1.buffer.toString()).toBe("ab");

    imageGetResponse = {
      async writeFile(filePath: string) {
        await fs.promises.writeFile(filePath, Buffer.from("file"));
      },
    };
    const res2 = await downloadImageFeishu({ cfg, imageKey: "img" });
    expect(res2.buffer.toString()).toBe("file");

    imageGetResponse = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from("x");
        yield Buffer.from("y");
      },
    };
    const res3 = await downloadImageFeishu({ cfg, imageKey: "img" });
    expect(res3.buffer.toString()).toBe("xy");
  });

  it("downloads message resource with data buffer", async () => {
    resourceGetResponse = { data: Buffer.from("data") };
    const res = await downloadMessageResourceFeishu({
      cfg,
      messageId: "msg",
      fileKey: "file",
      type: "file",
    });
    expect(res.buffer.toString()).toBe("data");

    resourceGetResponse = {
      getReadableStream() {
        return (async function* () {
          yield Buffer.from("a");
          yield Buffer.from("b");
        })();
      },
    };
    const res2 = await downloadMessageResourceFeishu({
      cfg,
      messageId: "msg",
      fileKey: "file",
      type: "file",
    });
    expect(res2.buffer.toString()).toBe("ab");
  });

  it("throws on failed download responses", async () => {
    imageGetResponse = { code: 1, msg: "bad" };
    await expect(downloadImageFeishu({ cfg, imageKey: "img" })).rejects.toThrow(
      "Feishu image download failed",
    );

    resourceGetResponse = { code: 2, msg: "bad" };
    await expect(
      downloadMessageResourceFeishu({ cfg, messageId: "msg", fileKey: "file", type: "file" }),
    ).rejects.toThrow("Feishu message resource download failed");
  });

  it("uploads image and file", async () => {
    imageCreateResponse = { image_key: "img_key" };
    const img = await uploadImageFeishu({ cfg, image: Buffer.from("img") });
    expect(img.imageKey).toBe("img_key");

    fileCreateResponse = { file_key: "file_key" };
    const file = await uploadFileFeishu({
      cfg,
      file: Buffer.from("file"),
      fileName: "file.pdf",
      fileType: "pdf",
    });
    expect(file.fileKey).toBe("file_key");
  });

  it("throws on upload errors", async () => {
    imageCreateResponse = { code: 1, msg: "bad" };
    await expect(uploadImageFeishu({ cfg, image: Buffer.from("img") })).rejects.toThrow(
      "Feishu image upload failed",
    );

    imageCreateResponse = { code: 0 };
    await expect(uploadImageFeishu({ cfg, image: Buffer.from("img") })).rejects.toThrow(
      "no image_key",
    );

    fileCreateResponse = { code: 1, msg: "bad" };
    await expect(
      uploadFileFeishu({ cfg, file: Buffer.from("file"), fileName: "file", fileType: "pdf" }),
    ).rejects.toThrow("Feishu file upload failed");

    fileCreateResponse = { code: 0 };
    await expect(
      uploadFileFeishu({ cfg, file: Buffer.from("file"), fileName: "file", fileType: "pdf" }),
    ).rejects.toThrow("no file_key");
  });

  it("sends image and file messages", async () => {
    messageCreateResponse = { code: 0, data: { message_id: "m1" } };
    messageReplyResponse = { code: 0, data: { message_id: "m2" } };

    const img = await sendImageFeishu({ cfg, to: "ou_1", imageKey: "img" });
    expect(img).toEqual({ messageId: "m1", chatId: "ou_1" });

    const reply = await sendFileFeishu({ cfg, to: "ou_1", fileKey: "file", replyToMessageId: "r" });
    expect(reply).toEqual({ messageId: "m2", chatId: "ou_1" });
  });

  it("throws when send fails", async () => {
    messageCreateResponse = { code: 2, msg: "bad" };
    await expect(sendImageFeishu({ cfg, to: "ou_1", imageKey: "img" })).rejects.toThrow(
      "Feishu image send failed",
    );

    messageReplyResponse = { code: 3, msg: "bad" };
    await expect(
      sendFileFeishu({ cfg, to: "ou_1", fileKey: "file", replyToMessageId: "r" }),
    ).rejects.toThrow("Feishu file reply failed");
  });

  it("sends media from buffer, local path, and url", async () => {
    imageCreateResponse = { image_key: "img_key" };
    fileCreateResponse = { file_key: "file_key" };
    const localCfg: ClawdbotConfig = {
      channels: { feishu: { appId: "app", appSecret: "secret", mediaAllowLocal: true } },
    } as ClawdbotConfig;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "feishu-media-"));
    const imgPath = path.join(tmpDir, "img.png");
    const filePath = path.join(tmpDir, "doc.pdf");
    fs.writeFileSync(imgPath, Buffer.from("img"));
    fs.writeFileSync(filePath, Buffer.from("file"));

    const res1 = await sendMediaFeishu({
      cfg,
      to: "ou_1",
      mediaBuffer: Buffer.from("img"),
      fileName: "img.png",
    });
    expect(res1.messageId).toBe("m1");

    loadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("img"),
      kind: "image",
      fileName: "img.png",
    });
    const res2 = await sendMediaFeishu({ cfg: localCfg, to: "ou_1", mediaUrl: imgPath });
    expect(res2.messageId).toBe("m1");

    loadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("file"),
      kind: "document",
      fileName: "doc.pdf",
    });
    const res3 = await sendMediaFeishu({ cfg: localCfg, to: "ou_1", mediaUrl: filePath });
    expect(res3.messageId).toBe("m1");

    loadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("file"),
      kind: "document",
      fileName: "doc.pdf",
    });
    const res4 = await sendMediaFeishu({
      cfg,
      to: "ou_1",
      mediaUrl: "https://example.com/doc.pdf",
    });
    expect(res4.messageId).toBe("m1");
  });

  it("throws when remote fetch fails", async () => {
    loadWebMedia.mockRejectedValue(new Error("boom"));
    await expect(
      sendMediaFeishu({ cfg, to: "ou_1", mediaUrl: "https://example.com/doc.pdf" }),
    ).rejects.toThrow("boom");
  });

  it("throws when no media provided", async () => {
    await expect(sendMediaFeishu({ cfg, to: "ou_1" })).rejects.toThrow(
      "Either mediaUrl or mediaBuffer must be provided",
    );
  });

  it("rejects local paths when disabled", async () => {
    await expect(sendMediaFeishu({ cfg, to: "ou_1", mediaUrl: "/tmp/file.png" })).rejects.toThrow(
      "Local media paths are disabled",
    );
  });
});
