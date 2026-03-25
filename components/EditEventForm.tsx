"use client";

import { updateEvent } from "@/app/actions/events";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type EditEventFormProps = {
  eventId: string;
  initial: {
    title: string;
    description: string | null;
    location: string | null;
    startAt: Date | string | null;
    endAt: Date | string | null;
  };
};

export function EditEventForm({ eventId, initial }: EditEventFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <form
        className="flex flex-col gap-4 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const title = String(fd.get("title") ?? "");
          const description = String(fd.get("description") ?? "");
          const location = String(fd.get("location") ?? "");
          const startAt = String(fd.get("startAt") ?? "");
          const endAt = String(fd.get("endAt") ?? "");

          setError(null);

          startTransition(async () => {
            const result = await updateEvent({
              eventId,
              title,
              description: description.trim() || null,
              location: location.trim() || null,
              startAt,
              endAt,
            });

            if (!result.ok) {
              setError(result.error);
            } else {
              router.refresh();
            }
          });
        }}
      >
        {error && (
          <p
            className="text-sm text-red-700 dark:text-red-400 rounded-md bg-red-50 dark:bg-red-950/50 px-3 py-2 border border-red-200 dark:border-red-900"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-event-title" className="text-sm font-medium">
            Title <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            id="edit-event-title"
            name="title"
            type="text"
            required
            autoComplete="off"
            defaultValue={initial.title}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-event-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="edit-event-description"
            name="description"
            rows={3}
            defaultValue={initial.description ?? ""}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-y min-h-[5rem]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-event-location" className="text-sm font-medium">
            Location
          </label>
          <input
            id="edit-event-location"
            name="location"
            type="text"
            autoComplete="off"
            defaultValue={initial.location ?? ""}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-event-start" className="text-sm font-medium">
              Start
            </label>
            <input
              id="edit-event-start"
              name="startAt"
              type="datetime-local"
              defaultValue={isoToDatetimeLocal(
                initial.startAt != null ? String(initial.startAt) : null,
              )}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-event-end" className="text-sm font-medium">
              End
            </label>
            <input
              id="edit-event-end"
              name="endAt"
              type="datetime-local"
              defaultValue={isoToDatetimeLocal(
                initial.endAt != null ? String(initial.endAt) : null,
              )}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Back to dashboard
          </Link>
        </div>
      </form>
    </div>
  );
}
