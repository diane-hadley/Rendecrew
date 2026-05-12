"use client";

import { updateUserTimezone } from "@/app/actions/user-settings";
import { getTimezoneSelectChoices } from "@/lib/event-datetime";
import { useEffect, useMemo, useState, useTransition } from "react";

type UserTimezoneFormProps = {
  initialTimeZone: string;
};

const selectClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400";

type TimezoneSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (iana: string) => void;
  disabled?: boolean;
};

function TimezoneSelect({
  id,
  label,
  value,
  onChange,
  disabled,
}: TimezoneSelectProps) {
  const grouped = useMemo(() => getTimezoneSelectChoices(value), [value]);

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium text-gray-900 dark:text-gray-100"
      >
        {label}
      </label>
      <select
        id={id}
        className={selectClass}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {grouped.map(({ group, choices }) => (
          <optgroup key={group} label={group}>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function UserTimezoneForm({ initialTimeZone }: UserTimezoneFormProps) {
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [savedTimeZone, setSavedTimeZone] = useState(initialTimeZone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isDirty = timeZone !== savedTimeZone;

  useEffect(() => {
    if (isDirty) setSaved(false);
  }, [isDirty]);

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isDirty) return;
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await updateUserTimezone(timeZone);
          if (!result.ok) {
            setError(result.error);
          } else {
            setSavedTimeZone(timeZone);
            setSaved(true);
          }
        });
      }}
    >
      {error && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
      <TimezoneSelect
        id="user-timezone"
        label="Default timezone for new events"
        value={timeZone}
        onChange={setTimeZone}
        disabled={isPending}
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        When creating a new event, the start and end times will default to this
        timezone unless you choose another. Event pages always show times in
        that event&apos;s zone.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="inline-flex w-fit items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-800"
        >
          {isPending ? "Saving…" : "Save"}
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
        {saved && !error && (
          <span className="text-sm text-green-700 dark:text-green-400">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
