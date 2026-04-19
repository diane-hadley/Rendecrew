"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CATEGORY_LABELS,
  NOTIFICATION_KIND_UI,
  type NotificationCategoryId,
  type NotificationKind,
  type NotificationKindUiMeta,
} from "@/lib/notification-kinds";
import {
  getEventNotificationOverrides,
  saveEventNotificationOverrides,
} from "@/app/actions/notifications";

type Tri = "inherit" | "on" | "off";

const ORDER: NotificationCategoryId[] = ["event", "packing", "rides", "tasks"];

function triFor(
  kind: NotificationKind,
  overrides: Record<string, boolean>,
): Tri {
  if (Object.prototype.hasOwnProperty.call(overrides, kind)) {
    return overrides[kind] ? "on" : "off";
  }
  return "inherit";
}

export function EventNotificationPreferencesForm({
  eventId,
}: {
  eventId: string;
}) {
  const [tri, setTri] = useState<Record<string, Tri>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await getEventNotificationOverrides(eventId);
      if (cancelled) return;
      if (!ev.ok) {
        setError(ev.error);
        setLoaded(true);
        return;
      }
      const t: Record<string, Tri> = {};
      for (const row of NOTIFICATION_KIND_UI) {
        t[row.kind] = triFor(row.kind, ev.overrides);
      }
      setTri(t);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const byCategory = useMemo(() => {
    const m = new Map<NotificationCategoryId, NotificationKindUiMeta[]>();
    for (const c of ORDER) m.set(c, []);
    for (const row of NOTIFICATION_KIND_UI) {
      m.get(row.category)!.push(row);
    }
    return m;
  }, []);

  function setKindTri(kind: NotificationKind, v: Tri) {
    setTri((prev) => ({ ...prev, [kind]: v }));
    setSaved(false);
  }

  function save() {
    setError(null);
    start(async () => {
      const final: Record<string, boolean> = {};
      for (const row of NOTIFICATION_KIND_UI) {
        const v = tri[row.kind] ?? "inherit";
        if (v === "inherit") continue;
        final[row.kind] = v === "on";
      }
      const r = await saveEventNotificationOverrides(eventId, final);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const ev = await getEventNotificationOverrides(eventId);
      if (ev.ok) {
        const t: Record<string, Tri> = {};
        for (const row of NOTIFICATION_KIND_UI) {
          t[row.kind] = triFor(row.kind, ev.overrides);
        }
        setTri(t);
      }
      setSaved(true);
    });
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>;
  }

  if (error && !Object.keys(tri).length) {
    return (
      <p className="text-sm text-red-700 dark:text-red-400" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {ORDER.map((cat) => {
        const rows = byCategory.get(cat) ?? [];
        if (!rows.length) return null;
        return (
          <div key={cat}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {CATEGORY_LABELS[cat]}
            </h4>
            <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {rows.map((row) => (
                <li
                  key={row.kind}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    {row.label}
                  </span>
                  <select
                    value={tri[row.kind] ?? "inherit"}
                    onChange={(e) =>
                      setKindTri(row.kind, e.target.value as Tri)
                    }
                    className="max-w-xs rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="inherit">Account default</option>
                    <option value="on">On for this event</option>
                    <option value="off">Off for this event</option>
                  </select>
                </li>
              ))}
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
          {pending ? "Saving…" : "Save event overrides"}
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
