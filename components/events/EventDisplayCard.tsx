import { GeneralInformationMarkdown } from "./GeneralInformationMarkdown";
import { PencilIcon } from "@/components/common/icons/PencilIcon";

export function EventDisplayCard({
  role,
  dateRangeLabel,
  location,
  generalInformation,
  onEditEventDetails,
  onEditGeneralInformation,
  showDetailsPanel = true,
  showGeneralInformationPanel = true,
}: {
  role: string;
  dateRangeLabel: string;
  location: string | null;
  generalInformation: string | null;
  onEditEventDetails?: () => void;
  onEditGeneralInformation?: () => void;
  showDetailsPanel?: boolean;
  showGeneralInformationPanel?: boolean;
}) {
  const generalInformationTrimmed = generalInformation?.trim() ?? "";
  const canEditEventDetails = onEditEventDetails != null;
  const canEditGeneralInformation = onEditGeneralInformation != null;
  const showRoleBadge = ["creator", "admin"].includes(
    role.trim().toLowerCase(),
  );

  return (
    <div className="w-full space-y-6">
      {showDetailsPanel && (
        <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Details
              </h2>
              {showRoleBadge && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                  {role}
                </span>
              )}
            </div>
            {canEditEventDetails && (
              <button
                type="button"
                aria-label="Edit event"
                title="Edit event"
                onClick={onEditEventDetails}
                className="inline-flex shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:ring-blue-400"
              >
                <PencilIcon className="size-4" />
              </button>
            )}
          </div>
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
            {dateRangeLabel}
          </p>
          {location && (
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {location}
            </p>
          )}
        </div>
      )}

      {showGeneralInformationPanel && (
        <section
          aria-label="General information"
          className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              General information
            </h3>
            {canEditGeneralInformation && (
              <button
                type="button"
                aria-label="Edit general info"
                title="Edit general info"
                onClick={onEditGeneralInformation}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:ring-blue-400"
              >
                <PencilIcon className="size-4" />
              </button>
            )}
          </div>
          {generalInformationTrimmed ? (
            <GeneralInformationMarkdown markdown={generalInformationTrimmed} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No general information yet.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
