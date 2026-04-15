"use client";

import { getTimezoneSelectChoices } from "@/lib/event-datetime";
import { useMemo } from "react";

const fieldClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400";

type TimezoneSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (iana: string) => void;
  disabled?: boolean;
};

export function TimezoneSelect({
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
        className={fieldClass}
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
