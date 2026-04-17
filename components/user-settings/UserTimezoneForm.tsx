"use client";

import { updateUserTimezone } from "@/app/actions/user-settings";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { useState, useTransition } from "react";

type UserTimezoneFormProps = {
  initialTimeZone: string;
};

export function UserTimezoneForm({ initialTimeZone }: UserTimezoneFormProps) {
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await updateUserTimezone(timeZone);
          if (!result.ok) {
            setError(result.error);
          } else {
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
      {saved && !error && (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          Saved.
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
        Start and end times you pick when creating an event use this zone unless
        you choose another on the form. Event pages always show times in that
        event&apos;s zone.
      </p>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-800"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
