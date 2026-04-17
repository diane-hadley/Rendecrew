"use client";

import { sendEventChatMessage } from "@/app/actions/event-chat";
import type { EventChatMessage } from "@/app/actions/event-chat";
import { useEffect, useRef, useState, useTransition } from "react";

export function EventChat({ eventId }: { eventId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<EventChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = messagesScrollRef.current;
    if (!el) return;
    const top = el.scrollHeight;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollTop = top;
    }
  }, [messages]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen ? (
        <button
          type="button"
          aria-label="Open event assistant chat"
          onClick={() => setIsOpen(true)}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        </button>
      ) : (
        <div className="flex max-h-[min(32rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Event assistant</h2>
              <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                Ask about this event—time, place, details, or the packing list.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close event assistant chat"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-800"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div
            ref={messagesScrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Example: &quot;Which items aren&apos;t yet signed up for?&quot;
                or &quot;How soon does this event start?&quot;
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-6 rounded-lg bg-blue-50 px-3 py-2 text-sm text-gray-900 dark:bg-blue-950/40 dark:text-gray-100"
                    : "mr-6 whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 dark:bg-gray-900/80 dark:text-gray-200"
                }
              >
                {m.content}
              </div>
            ))}
            {isPending && (
              <p className="mr-6 text-sm italic text-gray-500 dark:text-gray-400">
                Thinking…
              </p>
            )}
          </div>

          {error && (
            <div
              className="mx-4 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
              role="alert"
            >
              {error}
            </div>
          )}

          <form
            className="flex shrink-0 gap-2 border-t border-gray-200 p-4 dark:border-gray-700"
            onSubmit={(e) => {
              e.preventDefault();
              const text = input.trim();
              if (!text || isPending) return;

              setError(null);
              const next: EventChatMessage[] = [
                ...messages,
                { role: "user", content: text },
              ];
              setInput("");
              setMessages(next);

              startTransition(async () => {
                const result = await sendEventChatMessage(eventId, next);
                if (!result.ok) {
                  setError(result.error);
                  setMessages(messages);
                  setInput(text);
                  return;
                }
                setMessages([
                  ...next,
                  { role: "assistant", content: result.reply },
                ]);
              });
            }}
          >
            <label htmlFor={`event-chat-${eventId}`} className="sr-only">
              Message about this event
            </label>
            <textarea
              id={`event-chat-${eventId}`}
              rows={2}
              value={input}
              disabled={isPending}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask about this event…"
              className="flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:focus:ring-blue-400"
            />
            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="inline-flex h-fit shrink-0 items-center justify-center self-end rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-800"
            >
              {isPending ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
