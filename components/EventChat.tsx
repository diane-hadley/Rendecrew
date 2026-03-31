"use client";

import { sendEventChatMessage } from "@/app/actions/event-chat";
import type { EventChatMessage } from "@/app/actions/event-chat";
import { useEffect, useRef, useState, useTransition } from "react";

export function EventChat({ eventId }: { eventId: string }) {
  const [messages, setMessages] = useState<EventChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 flex flex-col max-h-[min(32rem,70vh)]">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <h2 className="text-lg font-semibold">Event assistant</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
          Ask about this event—time, place, details, or the packing list.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Example: &quot;Which items aren't yet signed up for?&quot; or &quot;How soon does this event start?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-6 rounded-lg bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                : "mr-6 rounded-lg bg-gray-100 dark:bg-gray-900/80 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap"
            }
          >
            {m.content}
          </div>
        ))}
        {isPending && (
          <p className="mr-6 text-sm text-gray-500 dark:text-gray-400 italic">
            Thinking…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div
          className="mx-4 mb-2 text-sm text-red-700 dark:text-red-400 rounded-md bg-red-50 dark:bg-red-950/50 px-3 py-2 border border-red-200 dark:border-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      <form
        className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0 flex gap-2"
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
            setMessages([...next, { role: "assistant", content: result.reply }]);
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
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="self-end shrink-0 inline-flex items-center justify-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:pointer-events-none h-fit"
        >
          {isPending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
