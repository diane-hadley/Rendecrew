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
      <div className="border-b border-red-200/90 pb-3 dark:border-red-900/45">
        <h3 className="text-lg font-semibold tracking-tight text-red-800 dark:text-red-300">
          {children}
        </h3>
      </div>
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

/** Category / subgroup label inside settings (e.g. notification kinds). */
export function EventSettingsSubsectionHeading({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <h4 className="mb-2 text-sm font-semibold tracking-tight text-gray-800 dark:text-gray-200">
      {children}
    </h4>
  );
}
