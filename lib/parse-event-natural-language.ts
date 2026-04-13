import { getAnthropic, ANTHROPIC_MODEL } from "@/lib/anthropic";

export type ParsedEventFields = {
  title: string;
  generalInformation: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
};

type ParseResult =
  | { ok: true; fields: ParsedEventFields }
  | { ok: false; error: string };

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(trimmed);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

/**
 * Uses Claude to turn a free-form event description into structured fields.
 * Narrative context is stored as Markdown-friendly general information when present.
 * Dates must be ISO 8601 strings or null (both start and end or both null).
 */
export async function parseEventFromNaturalLanguage(
  plainText: string,
  referenceNowIso: string,
): Promise<ParseResult> {
  const text = plainText.trim();
  if (!text) {
    return { ok: false, error: "Describe your event in a sentence or two" };
  }

  const client = getAnthropic();

  const system = `You extract event details from the user's message for a calendar app.
Respond with a single JSON object only (no markdown fences, no commentary), using this shape:
{"title":"string (short, required)","generalInformation":"string or null","location":"string or null","startAt":"ISO 8601 datetime string or null","endAt":"ISO 8601 datetime string or null"}

Rules:
- title: concise name for the event (required).
- generalInformation: optional Markdown for the event overview (itinerary, themes, notes). Use headings and bullet lists when the user gave structured details; otherwise a short paragraph is fine. null if there is no useful narrative beyond title, place, and times.
- location: venue, address, or place name if mentioned; otherwise null.
- startAt and endAt: both ISO 8601 strings in UTC or with explicit offset, or both null if the user did not give a usable time. Never send only one of them; if you infer a range, set both.
- Use reference time "${referenceNowIso}" as "now" when interpreting relative phrases like "next Friday", "tomorrow at 3pm", or "in two weeks".
- If times are ambiguous, pick reasonable defaults (e.g. business hours for a meeting) and keep the same local intent in the ISO strings.`;

  let raw: string;
  try {
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: text }],
    });
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { ok: false, error: "No text response from the model" };
    }
    raw = block.text;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to reach the language model";
    return { ok: false, error: message };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(raw));
  } catch {
    return {
      ok: false,
      error: "Could not parse event details from the response",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Invalid event data shape" };
  }

  const o = parsed as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) {
    return {
      ok: false,
      error:
        "The model did not produce a title; try adding a clearer name for the event",
    };
  }

  const startAt = asNullableString(o.startAt);
  const endAt = asNullableString(o.endAt);
  if ((startAt == null) !== (endAt == null)) {
    return {
      ok: false,
      error:
        "Parsed start and end times were inconsistent; try including both date and time",
    };
  }

  return {
    ok: true,
    fields: {
      title,
      generalInformation: asNullableString(
        o.generalInformation ?? o.description,
      ),
      location: asNullableString(o.location),
      startAt,
      endAt,
    },
  };
}
