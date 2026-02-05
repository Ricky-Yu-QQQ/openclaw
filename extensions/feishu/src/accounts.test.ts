import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import {
  listEnabledFeishuAccounts,
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
  resolveFeishuCredentials,
} from "./accounts.js";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

const baseCfg: ClawdbotConfig = { channels: {} };

describe("feishu accounts", () => {
  it("resolves credentials with trimming and defaults", () => {
    expect(resolveFeishuCredentials()).toBeNull();
    expect(resolveFeishuCredentials({ appId: " ", appSecret: "x" } as any)).toBeNull();

    const creds = resolveFeishuCredentials({
      appId: "  app ",
      appSecret: " secret ",
      encryptKey: "  enc ",
      verificationToken: "  token ",
    } as any);

    expect(creds).toEqual({
      appId: "app",
      appSecret: "secret",
      encryptKey: "enc",
      verificationToken: "token",
      domain: "feishu",
    });
  });

  it("resolves account state from config", () => {
    const cfg = {
      channels: {
        feishu: {
          enabled: false,
          appId: "app",
          appSecret: "secret",
          domain: "lark",
        },
      },
    } as ClawdbotConfig;

    const account = resolveFeishuAccount({ cfg, accountId: "  custom  " });
    expect(account).toEqual({
      accountId: "custom",
      enabled: false,
      configured: true,
      appId: "app",
      domain: "lark",
    });
  });

  it("lists enabled accounts only when configured", () => {
    const cfg = {
      channels: {
        feishu: {
          enabled: true,
          appId: "app",
          appSecret: "secret",
        },
      },
    } as ClawdbotConfig;

    expect(listFeishuAccountIds(baseCfg)).toEqual([DEFAULT_ACCOUNT_ID]);
    expect(resolveDefaultFeishuAccountId(baseCfg)).toBe(DEFAULT_ACCOUNT_ID);
    expect(listEnabledFeishuAccounts(cfg)).toEqual([
      {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: true,
        configured: true,
        appId: "app",
        domain: "feishu",
      },
    ]);
  });
});
