export const UrgentTypes = ["app", "sms", "phone"] as const;
export type UrgentType = (typeof UrgentTypes)[number];

export const UserIdTypes = ["open_id", "user_id", "union_id"] as const;
export type UserIdType = (typeof UserIdTypes)[number];

export function ensureUserIds(value: string[]): string[] {
  const cleaned = value.map((entry) => entry.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error("userIds required");
  }
  for (const id of cleaned) {
    const lower = id.toLowerCase();
    if (lower.startsWith("chat:") || lower.startsWith("chat_id:") || lower.startsWith("oc_")) {
      throw new Error("userIds must be user ids, not chat ids.");
    }
  }
  return cleaned;
}

export function readUserIds(params: Record<string, unknown>): string[] {
  const raw = params.userIds;
  if (Array.isArray(raw)) {
    return raw.filter((entry) => typeof entry === "string").map((entry) => entry.trim());
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

export function resolveUrgentUrl(messageId: string, urgentType: UrgentType): string {
  const suffix =
    urgentType === "app" ? "urgent_app" : urgentType === "sms" ? "urgent_sms" : "urgent_phone";
  return `/open-apis/im/v1/messages/${messageId}/${suffix}`;
}
