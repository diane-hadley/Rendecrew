"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  allowsPerEventNotificationOverride,
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
import { EventSettingsSubsectionHeading } from "./EventSettingsSectionHeading";

type Tri = "inherit" | "on" | "off";

const ALL_OPTIONAL_CATEGORIES: NotificationCategoryId[] = [
  "packing",
  "rides",
  "tasks",
];

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
  packingEnabled,
  ridesEnabled,
  taskBoardEnabled,
}: {
  eventId: string;
  packingEnabled: boolean;
  ridesEnabled: boolean;
  taskBoardEnabled: boolean;
}) {
  const [tri, setTri] = useState<Record<string, Tri>>({});
  const [baselineTri, setBaselineTri] = useState<Record<string, Tri>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
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
      setBaselineTri({ ...t });
      setSavedFlash(false);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const categoryOrder = useMemo(() => {
    return ALL_OPTIONAL_CATEGORIES.filter((cat) => {
      if (cat === "packing") return packingEnabled;
      if (cat === "rides") return ridesEnabled;
      if (cat === "tasks") return taskBoardEnabled;
      return false;
    });
  }, [packingEnabled, ridesEnabled, taskBoardEnabled]);

  const byCategory = useMemo(() => {
    const active = new Set(categoryOrder);
    const m = new Map<NotificationCategoryId, NotificationKindUiMeta[]>();
    for (const c of categoryOrder) m.set(c, []);
    for (const row of NOTIFICATION_KIND_UI) {
      if (!allowsPerEventNotificationOverride(row.kind)) continue;
      if (!active.has(row.category)) continue;
      m.get(row.category)!.push(row);
    }
    return m;
  }, [categoryOrder]);

  const isDirty = useMemo(() => {
    const active = new Set(categoryOrder);
    for (const row of NOTIFICATION_KIND_UI) {
      if (!allowsPerEventNotificationOverride(row.kind)) continue;
      if (!active.has(row.category)) continue;
      const cur = tri[row.kind] ?? "inherit";
      const base = baselineTri[row.kind] ?? "inherit";
      if (cur !== base) return true;
    }
    return false;
  }, [tri, baselineTri, categoryOrder]);

  useEffect(() => {
    if (isDirty) setSavedFlash(false);
  }, [isDirty]);

  function setKindTri(kind: NotificationKind, v: Tri) {
    setTri((prev) => ({ ...prev, [kind]: v }));
  }

  function save() {
    setError(null);
    start(async () => {
      const activeCategories = new Set(categoryOrder);
      const final: Record<string, boolean> = {};
      for (const row of NOTIFICATION_KIND_UI) {
        if (!allowsPerEventNotificationOverride(row.kind)) continue;
        if (!activeCategories.has(row.category)) continue;
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
      if (!ev.ok) {
        setError(ev.error);
        return;
      }
      const t: Record<string, Tri> = {};
      for (const row of NOTIFICATION_KIND_UI) {
        t[row.kind] = triFor(row.kind, ev.overrides);
      }
      setTri(t);
      setBaselineTri({ ...t });
      setSavedFlash(true);
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

  if (categoryOrder.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="divide-y divide-gray-200 dark:divide-gray-700 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0 [&>div]:py-6">
        {categoryOrder.flatMap((cat) => {
          const rows = byCategory.get(cat) ?? [];
          if (!rows.length) return [];
          return [
            <div key={cat}>
              <EventSettingsSubsectionHeading variant="overline">
                {CATEGORY_LABELS[cat]}
              </EventSettingsSubsectionHeading>
              <ul className="mt-1 space-y-4 border-l border-gray-200 py-0.5 pl-5 dark:border-gray-600 sm:pl-6">
                {rows.map((row) => {
                  const fieldId = `event-notification-${eventId}-${row.kind}`;
                  return (
                    <li key={row.kind}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                        <div className="min-w-0">
                          <label
                            htmlFor={fieldId}
                            className="text-sm font-medium text-gray-900 dark:text-gray-100"
                          >
                            {row.label}
                          </label>
                        </div>
                        <div className="shrink-0">
                          <select
                            id={fieldId}
                            value={tri[row.kind] ?? "inherit"}
                            onChange={(e) =>
                              setKindTri(row.kind, e.target.value as Tri)
                            }
                            className="w-full min-w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm sm:w-auto dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          >
                            <option value="inherit">Account default</option>
                            <option value="on">On for this event</option>
                            <option value="off">Off for this event</option>
                          </select>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>,
          ];
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={pending || !isDirty}
          onClick={save}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save event overrides"}
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
        {savedFlash && (
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
