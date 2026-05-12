"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CATEGORY_LABELS,
  NOTIFICATION_KIND_UI,
  type NotificationCategoryId,
  type NotificationKindUiMeta,
} from "@/lib/notification-kinds";
import { saveUserNotificationPreferences } from "@/app/actions/notifications";

const ORDER: NotificationCategoryId[] = ["event", "packing", "rides", "tasks"];

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export function NotificationPreferencesForm(props: {
  initialDisabledKinds: string[];
}) {
  const [disabled, setDisabled] = useState(
    () => new Set(props.initialDisabledKinds),
  );
  const [savedDisabled, setSavedDisabled] = useState(
    () => new Set(props.initialDisabledKinds),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const byCategory = useMemo(() => {
    const m = new Map<NotificationCategoryId, NotificationKindUiMeta[]>();
    for (const c of ORDER) m.set(c, []);
    for (const row of NOTIFICATION_KIND_UI) {
      m.get(row.category)!.push(row);
    }
    return m;
  }, []);
  const isDirty = !setsEqual(disabled, savedDisabled);

  function toggle(kind: string, enabled: boolean) {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(kind);
      else next.add(kind);
      return next;
    });
    setSaved(false);
  }

  function save() {
    if (!isDirty) return;
    setError(null);
    start(async () => {
      const r = await saveUserNotificationPreferences([...disabled]);
      if (!r.ok) {
        setError("Could not save preferences.");
        return;
      }
      setSavedDisabled(new Set(disabled));
      setSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      {ORDER.map((cat) => {
        const rows = byCategory.get(cat) ?? [];
        if (!rows.length) return null;
        return (
          <div key={cat}>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {CATEGORY_LABELS[cat]}
            </h3>
            <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {rows.map((row) => {
                const on = !disabled.has(row.kind);
                const fieldId = `user-notif-${row.kind}`;
                return (
                  <li key={row.kind}>
                    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-200">
                        {row.label}
                      </span>
                      <input
                        id={fieldId}
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(row.kind, e.target.checked)}
                        className="peer sr-only"
                      />
                      <span
                        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-200 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-in-out peer-checked:bg-blue-600 peer-checked:after:translate-x-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 dark:bg-gray-700 dark:after:bg-gray-100 dark:peer-checked:bg-blue-500"
                        aria-hidden="true"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !isDirty}
          onClick={save}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save notification preferences"}
        </button>
        {isDirty && (
          <span
            className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            role="status"
            aria-live="polite"
          >
            Unsaved changes
          </span>
        )}
        {saved && (
          <span className="text-sm text-green-700 dark:text-green-400">
            Saved.
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
