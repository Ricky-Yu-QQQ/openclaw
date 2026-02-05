import { describe, expect, it, beforeEach, vi } from "vitest";

const createdClients: any[] = [];
const createdWsClients: any[] = [];
const createdDispatchers: any[] = [];

vi.mock("@larksuiteoapi/node-sdk", () => {
  class Client {
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
      createdClients.push(this);
    }
  }
  class WSClient {
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
      createdWsClients.push(this);
    }
  }
  class EventDispatcher {
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
      createdDispatchers.push(this);
    }
  }

  return {
    Client,
    WSClient,
    EventDispatcher,
    Domain: { Lark: "lark", Feishu: "feishu" },
    AppType: { SelfBuild: "selfbuild" },
    LoggerLevel: { info: "info" },
  };
});

import {
  clearClientCache,
  createEventDispatcher,
  createFeishuClient,
  createFeishuWSClient,
} from "./client.js";

describe("feishu client", () => {
  beforeEach(() => {
    clearClientCache();
    createdClients.length = 0;
    createdWsClients.length = 0;
    createdDispatchers.length = 0;
  });

  it("creates cached client with domain mapping", () => {
    const cfg = { appId: "app", appSecret: "secret", domain: "lark" } as any;
    const first = createFeishuClient(cfg);
    const second = createFeishuClient(cfg);

    expect(first).toBe(second);
    expect(createdClients).toHaveLength(1);
    expect(createdClients[0].opts).toEqual({
      appId: "app",
      appSecret: "secret",
      appType: "selfbuild",
      domain: "lark",
    });
  });

  it("refreshes client cache when credentials change", () => {
    const cfgA = { appId: "app", appSecret: "secret", domain: "feishu" } as any;
    const cfgB = { appId: "app2", appSecret: "secret2", domain: "feishu" } as any;

    const first = createFeishuClient(cfgA);
    const second = createFeishuClient(cfgB);

    expect(first).not.toBe(second);
    expect(createdClients).toHaveLength(2);
  });

  it("throws when credentials missing", () => {
    expect(() => createFeishuClient({} as any)).toThrow(
      "Feishu credentials not configured (appId, appSecret required)",
    );
  });

  it("creates ws client and event dispatcher", () => {
    const cfg = { appId: "app", appSecret: "secret", domain: "feishu" } as any;

    const ws = createFeishuWSClient(cfg);
    const dispatcher = createEventDispatcher(cfg);

    expect(ws).toBeDefined();
    expect(dispatcher).toBeDefined();
    expect(createdWsClients[0].opts).toEqual({
      appId: "app",
      appSecret: "secret",
      domain: "feishu",
      loggerLevel: "info",
    });
    expect(createdDispatchers[0].opts).toEqual({
      encryptKey: undefined,
      verificationToken: undefined,
    });
  });
});
