/** ISO datetime strings or null — one line for AI system prompts. */
export function formatEventWhenForAiPrompt(
  startAt: string | null,
  endAt: string | null,
): string {
  if (startAt && endAt) return `${startAt} – ${endAt}`;
  if (startAt) return `start: ${startAt} (end not set)`;
  if (endAt) return `end: ${endAt} (start not set)`;
  return "not set on the event";
}
