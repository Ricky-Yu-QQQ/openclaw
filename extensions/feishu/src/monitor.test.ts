import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

const wsStart = vi.fn();
const dispatcherRegister = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuWSClient: vi.fn(() => ({ start: (...args: any[]) => wsStart(...args) })),
  createEventDispatcher: vi.fn(() => ({ register: (...args: any[]) => dispatcherRegister(...args) })),
}));

vi.mock("./probe.js", () => ({
  probeFeishu: vi.fn().mockResolvedValue({ ok: true, botOpenId: "ou_bot" }),
}));

import { monitorFeishuProvider, stopFeishuMonitor } from "./monitor.js";

describe("feishu monitor", () => {
  beforeEach(() => {
    wsStart.mockReset();
    dispatcherRegister.mockReset();
  });

  it("throws without config", async () => {
    await expect(monitorFeishuProvider()).rejects.toThrow("Config is required");
  });

  it("throws without credentials", async () => {
    const cfg = { channels: { feishu: {} } } as ClawdbotConfig;
    await expect(monitorFeishuProvider({ config: cfg })).rejects.toThrow(
      "Feishu credentials not configured",
    );
  });

  it("logs in webhook mode without starting ws", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", connectionMode: "webhook" } },
    } as ClawdbotConfig;
    const log = vi.fn();

    await monitorFeishuProvider({ config: cfg, runtime: { log } as any });
    expect(wsStart).not.toHaveBeenCalled();
  });

  it("starts websocket and honors abort signal", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", connectionMode: "websocket" } },
    } as ClawdbotConfig;
    const abort = new AbortController();
    abort.abort();

    await monitorFeishuProvider({ config: cfg, abortSignal: abort.signal, runtime: { log: vi.fn(), error: vi.fn() } as any });
    expect(dispatcherRegister).toHaveBeenCalled();
  });

  it("stops monitor safely", () => {
    stopFeishuMonitor();
  });
});
