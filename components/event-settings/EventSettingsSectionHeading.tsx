import type { ReactNode } from "react";

type EventSettingsSectionHeadingProps = {
  children: ReactNode;
  /** Page title (large, underlined). */
  level?: "page" | "section" | "danger";
};

/**
 * Shared heading styles for event settings so section titles read clearly
 * against body copy and controls.
 */
export function EventSettingsSectionHeading({
  children,
  level = "section",
}: EventSettingsSectionHeadingProps) {
  if (level === "page") {
    return (
      <div className="border-b border-gray-200 pb-4 dark:border-gray-700">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {children}
        </h2>
      </div>
    );
  }

  if (level === "danger") {
    return (
      <h3 className="text-lg font-semibold tracking-tight text-red-800 dark:text-red-300">
        {children}
      </h3>
    );
  }

  return (
    <div className="border-b border-gray-200 pb-3 dark:border-gray-600">
      <h3 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {children}
      </h3>
    </div>
  );
}

type EventSettingsSubsectionHeadingProps = {
  children: ReactNode;
  /** Uppercase overline style for dense grouped settings (e.g. notification categories). */
  variant?: "default" | "overline";
};

/** Category / subgroup label inside settings (e.g. notification kinds). */
export function EventSettingsSubsectionHeading({
  children,
  variant = "default",
}: EventSettingsSubsectionHeadingProps) {
  if (variant === "overline") {
    return (
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-gray-400">
        {children}
      </h4>
    );
  }
  return (
    <h4 className="mb-2 text-sm font-semibold tracking-tight text-gray-800 dark:text-gray-200">
      {children}
    </h4>
  );
}
