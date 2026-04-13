"use server";

import { getAnthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";
import { formatEventWhenForAiPrompt } from "@/lib/format-event-when-for-ai-prompt";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

const MAX_INSTRUCTION_CHARS = 4_000;
const MAX_CURRENT_CHARS = 80_000;

/** Join all text blocks (models sometimes emit more than one). */
function anthropicTextFromMessageContent(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((b): b is { type: "text"; text?: string } => b.type === "text")
    .map((b) => (b.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * If the model wrapped the whole answer in one markdown fence, unwrap it.
 * Only handles a single outer ``` … ``` pair after trim.
 */
function stripOptionalOuterMarkdownFence(text: string): string {
  const t = text.trim();
  const open = /^```[\w+-]*\r?\n/;
  const close = /\r?\n```\s*$/;
  if (!open.test(t) || !close.test(t)) return text.trim();
  return t.replace(open, "").replace(close, "").trim();
}

export type AssistEventGeneralInformationResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

/**
 * Uses Claude to draft or revise the event's Markdown "General information" section (organizers only).
 */
export async function assistEventGeneralInformation(
  eventId: string,
  input: { currentMarkdown: string; instruction: string },
): Promise<AssistEventGeneralInformationResult> {
  const instruction = input.instruction.trim();
  if (!instruction) {
    return {
      ok: false,
      error: "Describe what you want the assistant to write",
    };
  }
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    return {
      ok: false,
      error: `Instructions are too long (max ${MAX_INSTRUCTION_CHARS} characters)`,
    };
  }

  const current = input.currentMarkdown;
  if (current.length > MAX_CURRENT_CHARS) {
    return {
      ok: false,
      error: `Current text is too long (max ${MAX_CURRENT_CHARS} characters)`,
    };
  }

  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return {
      ok: false,
      error: "You do not have permission to use the assistant on this event",
    };
  }

  const ev = row.event;
  const when = formatEventWhenForAiPrompt(
    ev.startAt?.toISOString() ?? null,
    ev.endAt?.toISOString() ?? null,
  );

  const system = `You help event organizers write the "General information" section for a group trip or gathering app.
Output GitHub-flavored Markdown only (no surrounding explanation, no JSON). Use headings, bullet lists, numbered steps, bold text, and links where useful. Suitable content includes itinerary, themed nights, arrival notes, links to maps, and house rules.

Event facts (do not contradict):
- Title: ${ev.title}
- Location: ${ev.location?.trim() || "(not set)"}
- When: ${when}

Rules:
- Follow the user's instruction carefully.
- If they ask to edit an existing draft, improve it while preserving useful structure when sensible.
- If the draft is empty, write new content from the instruction and event facts.
- Do not invent specific times, prices, or policies that contradict the instruction or event facts; you may use sensible placeholders only if the user asked for a template.
- Keep a practical tone for participants.`;

  const userMessage = `User instruction:\n${instruction}\n\n---\nExisting draft (may be empty):\n${current || "(empty)"}\n---`;

  let client;
  try {
    client = getAnthropic();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "AI is not configured (missing API key)";
    return { ok: false, error: message };
  }

  try {
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8_192,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    const markdownRaw = anthropicTextFromMessageContent(
      msg.content as Array<{ type: string; text?: string }>,
    );
    const markdown = stripOptionalOuterMarkdownFence(markdownRaw);
    if (!markdown) {
      return { ok: false, error: "The model returned an empty response" };
    }
    return { ok: true, markdown };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "Failed to get a response from the assistant";
    return { ok: false, error: message };
  }
}
