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

export function NotificationPreferencesForm(props: {
  initialDisabledKinds: string[];
}) {
  const [disabled, setDisabled] = useState(
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
    setError(null);
    start(async () => {
      const r = await saveUserNotificationPreferences([...disabled]);
      if (!r.ok) {
        setError("Could not save preferences.");
        return;
      }
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
                return (
                  <li
                    key={row.kind}
                    className="flex items-start justify-between gap-4 px-4 py-3"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      {row.label}
                    </span>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(row.kind, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                      />
                      On
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
          disabled={pending}
          onClick={save}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save notification preferences"}
        </button>
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
