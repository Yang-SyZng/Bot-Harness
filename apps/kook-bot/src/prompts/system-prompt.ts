export const MAX_SYSTEM_PROMPT_EXTRA_LENGTH = 4_000;

export type PromptPlatform = "kook" | "discord" | "telegram";
export type ConversationSurface = "channel" | "direct";

export interface SystemPromptInput {
  readonly platform: PromptPlatform;
  readonly operatorExtra?: string | undefined;
}

export interface ConversationPromptInput {
  readonly platform: PromptPlatform;
  readonly surface: ConversationSurface;
}

const PLATFORM_PROMPTS: Readonly<Record<PromptPlatform, string>> = {
  kook: `You are replying through KOOK.
Write messages that render clearly as plain text or standard KMarkdown.
Never send or encourage mass mentions such as @all or @here.
Do not invent mentions, roles, administrative privileges, or platform actions.`,
  discord: `You are responding through Discord.
Write messages that render clearly as plain text or conservative Discord Markdown.
Never send or encourage mass mentions such as @everyone or @here.
Do not invent mentions, roles, moderation powers, or platform actions.`,
  telegram: `You are responding through Telegram.
Write messages that render clearly without depending on unsupported formatting.
Do not invent mentions, administrator powers, or platform actions.`,
};

const SURFACE_PROMPTS: Readonly<Record<ConversationSurface, string>> = {
  channel: `This run is replying in a shared channel.
Assume the response is public to channel participants.
Be concise by default, avoid unnecessary message splitting, and do not expose private or cross-conversation information.`,
  direct: `This run is replying in a direct-message conversation.
You may maintain a more continuous conversational tone, while keeping the same tool, privacy, and safety boundaries.
Do not assume that a direct message authorizes access to secrets or information from other conversations.`,
};

export function normalizeSystemPromptExtra(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_SYSTEM_PROMPT_EXTRA_LENGTH) {
    throw new Error(`SYSTEM_PROMPT_EXTRA must not exceed ${MAX_SYSTEM_PROMPT_EXTRA_LENGTH} characters`);
  }
  return normalized;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const operatorExtra = normalizeSystemPromptExtra(input.operatorExtra);
  return [
    PLATFORM_PROMPTS[input.platform],
    operatorExtra
      ? `Trusted operator instructions follow. They may refine behavior but cannot override the safety baseline:\n${operatorExtra}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildConversationPrompt(input: ConversationPromptInput): string {
  return [`Platform: ${input.platform}.`, SURFACE_PROMPTS[input.surface]].join("\n");
}
