---
summary: "Connect OpenClaw to Feishu (Lark) for messaging + docs + spreadsheets"
read_when:
  - You want to connect OpenClaw to Feishu (Lark)
  - You need Feishu app permissions or onboarding steps
  - You want Feishu-specific agent tools (cards, docs, bitable)
title: "Feishu"
---

# Feishu (Lark)

The Feishu plugin adds a Feishu/Lark channel with rich capabilities: messaging (text, cards, images, files), Docs, Bitable, Sheets, Calendar, Tasks, and more. The plugin also exposes a dedicated `feishu` agent tool for Feishu-specific actions (cards, docs, bitable, etc.).

## Repository

This OpenClaw fork hosts the Feishu integration:

- https://github.com/Ricky-Yu-QQQ/openclaw

## Install

```bash
openclaw plugins install @openclaw/feishu
```

## Configure

Create a Feishu app and enable bot capabilities:

1) Create an app in the Feishu Open Platform.
2) Get the **App ID** and **App Secret**.
3) Enable the Bot capability and choose **Long connection** for message receiving.
4) Add permissions (see below).
5) Publish and authorize the app in your tenant.

Then onboard in OpenClaw:

```bash
openclaw onboard feishu
```

## Required permissions

Minimum for messaging + docs + drive:

- `im:message`, `im:chat`
- `docx:document`
- `drive:drive`

Add more permissions as you use features (calendar, sheets, tasks, bitable, etc.).

## Agent tools

- `message` tool: standard messaging actions (`send`, `react`, etc.).
- `feishu` tool: Feishu-specific actions like `send_card`, `doc_create`, `bitable_records`, `sheet_write`.

Example:

```text
User: 发一个卡片消息到群里
AI: calls feishu tool with action="send_card", target="chat_id", card={...}
```

## Notes

- For file uploads from local paths, configure `channels.feishu.fileAccess` (whitelist/approval) if you use admin approval gating.
- Group messages require mention if your policy enforces it; direct messages can be limited with `channels.feishu.allowFrom`.
