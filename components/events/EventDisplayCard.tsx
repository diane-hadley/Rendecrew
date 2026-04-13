import { EventGeneralInformationMarkdown } from "./EventGeneralInformationMarkdown";

export function EventDisplayCard({
  title,
  role,
  dateRangeLabel,
  location,
  generalInformation,
}: {
  title: string;
  role: string;
  dateRangeLabel: string;
  location: string | null;
  generalInformation: string | null;
}) {
  const generalInformationTrimmed = generalInformation?.trim() ?? "";

  return (
    <div className="w-full space-y-6">
      <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 pr-2 text-2xl font-semibold">
            {title}
          </h2>
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-800 dark:bg-gray-700 dark:text-gray-200">
            {role}
          </span>
        </div>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
          {dateRangeLabel}
        </p>
        {location && (
          <p className="text-sm text-gray-500 dark:text-gray-500">{location}</p>
        )}
      </div>

      {generalInformationTrimmed ? (
        <section
          aria-label="Event information"
          className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800"
        >
          <EventGeneralInformationMarkdown
            markdown={generalInformationTrimmed}
          />
        </section>
      ) : null}
    </div>
  );
}
