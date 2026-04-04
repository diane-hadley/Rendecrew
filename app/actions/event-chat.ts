"use server";

import { getAnthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { getEventForUser } from "@/lib/events";
import { getEventAISystemPromptSection } from "@/lib/event-ai-context";
import { getOrCreateUser } from "@/lib/user";

export type EventChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_USER_MESSAGE_CHARS = 8_000;
const MAX_MESSAGES_IN_REQUEST = 40;

function trimMessages(messages: EventChatMessage[]): EventChatMessage[] {
  if (messages.length <= MAX_MESSAGES_IN_REQUEST) return messages;
  return messages.slice(-MAX_MESSAGES_IN_REQUEST);
}

function validateConversation(messages: EventChatMessage[]): string | null {
  if (messages.length === 0) {
    return "Send a message to start";
  }
  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    return "Last message must be from the user";
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m.content || !m.content.trim()) {
      return "Messages cannot be empty";
    }
    if (i > 0 && messages[i].role === messages[i - 1].role) {
      return "Messages must alternate between user and assistant";
    }
  }
  if (messages[0].role !== "user") {
    return "Conversation must start with a user message";
  }
  return null;
}

/**
 * Answers questions about the event (details, schedule, location, packing list, sign-ups) using Claude and live DB context.
 */
export async function sendEventChatMessage(
  eventId: string,
  messages: EventChatMessage[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const trimmed = trimMessages(messages);
  const validationError = validateConversation(trimmed);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const lastUser = trimmed[trimmed.length - 1];
  if (lastUser.content.length > MAX_USER_MESSAGE_CHARS) {
    return {
      ok: false,
      error: `Message is too long (max ${MAX_USER_MESSAGE_CHARS} characters)`,
    };
  }

  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) {
    return { ok: false, error: "Event not found or you do not have access" };
  }

  const contextBlock = await getEventAISystemPromptSection(eventId);
  if (!contextBlock) {
    return { ok: false, error: "Could not load event context" };
  }

  const system = `You help people with questions about this event. Use ONLY the information in the context below—title, description, when and where it happens, and the packing list (items, quantities, who signed up to bring what, packed status). Answer clearly and concisely. If the context does not include something (e.g. parking, dress code, or details not in the description), say you do not see that in the event details rather than guessing. You may briefly help with practical follow-ups that combine only what is in the context (e.g. summarizing dates or comparing quantities). For topics completely unrelated to this event, politely say you can only help with what is known about this event.

${contextBlock}`;

  let client;
  try {
    client = getAnthropic();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "AI is not configured (missing API key)";
    return { ok: false, error: message };
  }

  const apiMessages = trimmed.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content.trim(),
  }));

  try {
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2_048,
      system,
      messages: apiMessages,
    });
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { ok: false, error: "No text response from the model" };
    }
    return { ok: true, reply: block.text.trim() };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "Failed to get a response from the assistant";
    return { ok: false, error: message };
  }
}
