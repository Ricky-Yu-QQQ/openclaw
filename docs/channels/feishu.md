---
summary: "Connect OpenClaw to Feishu (Lark) for messaging, docs, wiki, drive, and bitable"
read_when:
  - You want to connect OpenClaw to Feishu (Lark)
  - You need Feishu app permissions or onboarding steps
  - You want Feishu-specific agent tools (cards, docs, bitable)
title: "Feishu"
---

# Feishu (Lark)

The Feishu plugin adds a Feishu/Lark channel with rich capabilities: messaging (DMs and groups), cards, inbound media, plus document, wiki, drive, and bitable tools. It also supports mention forwarding, configurable render modes, and permission-aware error hints.

## Repository

Source repository:

- https://github.com/m1heng/clawdbot-feishu

## Install

```bash
openclaw plugins install @openclaw/feishu
```

## Configure

Create a Feishu app and enable bot capabilities:

1) Create an app in the Feishu Open Platform.
2) Get the **App ID** and **App Secret**.
3) Enable the Bot capability and select **Long connection** for message receiving.
4) Add permissions (see below).
5) Configure event subscriptions (see below).
6) Publish and authorize the app in your tenant.

Then onboard in OpenClaw:

```bash
openclaw onboard feishu
```

Or set config directly:

```bash
openclaw config set channels.feishu.appId "cli_xxxxx"
openclaw config set channels.feishu.appSecret "your_app_secret"
openclaw config set channels.feishu.enabled true
```

## Required permissions

Minimum for messaging:

- `im:message`
- `im:message.p2p_msg:readonly`
- `im:message.group_at_msg:readonly`
- `im:message:send_as_bot`
- `im:resource`

Optional messaging permissions:

- `contact:user.base:readonly` (resolve sender display names)
- `im:message.group_msg` (read all group messages)
- `im:message:readonly` (read message history)
- `im:message:update` (edit messages)
- `im:message:recall` (recall messages)
- `im:message.reactions:read` (read reactions)
- Message urgent permissions (app/SMS/phone), as configured in Feishu Open Platform

Tool permissions, read-only minimum:

- `docx:document:readonly` for `feishu_doc`
- `drive:drive:readonly` for `feishu_drive`
- `wiki:wiki:readonly` for `feishu_wiki`
- `bitable:app:readonly` for `feishu_bitable`

Tool permissions, read-write optional:

- `docx:document` and `docx:document.block:convert` for write and append
- `drive:drive` for uploads and file management
- `wiki:wiki` for create and rename
- `bitable:app` for write operations

## Agent tools

- `message` tool: standard messaging actions (`send`, `react`, etc.).
- `feishu_doc`: docs read, write, append, create, block operations.
- `feishu_wiki`: list spaces, list nodes, search, create or move nodes.
- `feishu_drive`: list folders, get file info, create folders, move or delete files.
- `feishu_bitable`: read and write bitable records.
- `feishu_perm`: manage permissions and sharing (disabled by default).
- `feishu_app_scopes`: list current app permission scopes.
- `feishu_urgent`: trigger message urgent notifications (app/SMS/phone).
  - When your message @mentions users, the bot reply will be marked urgent for those users (app).
  - Keyword command (no LLM): send `加急消息 <内容>` with @mentions to trigger urgent reply immediately.

Tools can be toggled via `channels.feishu.tools`.

## Event subscriptions

Set **Long connection** in Feishu Open Platform, then add these events:

- `im.message.receive_v1`
- `im.message.message_read_v1`
- `im.chat.member.bot.added_v1`
- `im.chat.member.bot.deleted_v1`

## Configuration options

```yaml
channels:
  feishu:
    enabled: true
    appId: "cli_xxxxx"
    appSecret: "secret"
    domain: "feishu" # or "lark"
    connectionMode: "websocket" # or "webhook"
    dmPolicy: "pairing" # "open" | "pairing" | "allowlist"
    allowFrom: ["*"] # required when dmPolicy="open"
    groupPolicy: "allowlist" # "open" | "allowlist" | "disabled"
    groupAllowFrom: ["ou_xxxxx"]
    requireMention: true
    mediaMaxMb: 30
    renderMode: "auto" # "auto" | "raw" | "card"
    tools:
      doc: true
      wiki: true
      drive: true
      perm: false
      scopes: true
      urgent: true
```

## Render mode

- `auto`: detects markdown and uses cards when helpful.
- `raw`: always send plain text, tables are converted to ASCII.
- `card`: always send interactive cards with markdown rendering.

## Notes

- Bots can only access files, wiki spaces, and bitables that are shared with them.
- Wiki access requires adding the bot to each wiki space, not just API permissions.
- Group messages are mention-gated when `requireMention` is enabled.
