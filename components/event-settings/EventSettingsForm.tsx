"use client";

import {
  MemberManagementPolicy as MMPolicy,
  PackingListVisibility as PLVis,
  type MemberManagementPolicy,
  type PackingListVisibility,
} from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateEventSettings } from "@/app/actions/event-settings";
import { DeleteEventPanel } from "./DeleteEventPanel";
import { EventNotificationPreferencesForm } from "./EventNotificationPreferencesForm";
import { EventOptionalFeaturesSection } from "./EventOptionalFeaturesSection";
import {
  EventSettingsSectionHeading,
  EventSettingsSubsectionHeading,
} from "./EventSettingsSectionHeading";

type EventSettingsFormProps = {
  eventId: string;
  eventTitle: string;
  canEdit: boolean;
  isCreator: boolean;
  initial: {
    memberManagementPolicy: MemberManagementPolicy;
    packingListVisibility: PackingListVisibility;
    packingEnabled: boolean;
    suggestionApprovalRequired: boolean;
    ridesEnabled: boolean;
    taskBoardEnabled: boolean;
  };
};

export function EventSettingsForm({
  eventId,
  eventTitle,
  canEdit,
  isCreator,
  initial,
}: EventSettingsFormProps) {
  const router = useRouter();
  const [memberPolicy, setMemberPolicy] = useState(
    initial.memberManagementPolicy,
  );
  const [packingVis, setPackingVis] = useState(initial.packingListVisibility);
  const [suggestionApproval, setSuggestionApproval] = useState(
    initial.suggestionApprovalRequired,
  );
  const [packingEnabled, setPackingEnabled] = useState(initial.packingEnabled);
  const [ridesEnabled, setRidesEnabled] = useState(initial.ridesEnabled);
  const [taskBoardEnabled, setTaskBoardEnabled] = useState(
    initial.taskBoardEnabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [featureOpsPending, setFeatureOpsPending] = useState(false);
  const [isSavePending, startSaveTransition] = useTransition();

  const isDirty =
    memberPolicy !== initial.memberManagementPolicy ||
    packingVis !== initial.packingListVisibility ||
    suggestionApproval !== initial.suggestionApprovalRequired;

  useEffect(() => {
    setMemberPolicy(initial.memberManagementPolicy);
    setPackingVis(initial.packingListVisibility);
    setSuggestionApproval(initial.suggestionApprovalRequired);
    setPackingEnabled(initial.packingEnabled);
    setRidesEnabled(initial.ridesEnabled);
    setTaskBoardEnabled(initial.taskBoardEnabled);
  }, [
    initial.memberManagementPolicy,
    initial.packingListVisibility,
    initial.suggestionApprovalRequired,
    initial.packingEnabled,
    initial.ridesEnabled,
    initial.taskBoardEnabled,
  ]);

  useEffect(() => {
    if (isDirty) setSavedFlash(false);
  }, [isDirty]);

  function save() {
    if (!canEdit) return;
    if (!isDirty) return;
    setError(null);
    setSavedFlash(false);
    startSaveTransition(async () => {
      const r = await updateEventSettings({
        eventId,
        memberManagementPolicy: memberPolicy,
        packingListVisibility: packingVis,
        suggestionApprovalRequired: suggestionApproval,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedFlash(true);
      router.refresh();
    });
  }

  const disabled = !canEdit || isSavePending || featureOpsPending;

  const showEventNotificationPreferences =
    packingEnabled || ridesEnabled || taskBoardEnabled;

  return (
    <div className="space-y-8">
      <div>
        <EventSettingsSectionHeading level="page">
          Settings
        </EventSettingsSectionHeading>
        {!canEdit && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Only admins can change these settings. You can view the current
            configuration below.
          </p>
        )}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <EventSettingsSectionHeading>
          Member management
        </EventSettingsSectionHeading>
        <div className="mt-4">
          <label className="flex cursor-pointer items-center gap-3">
            <span className="sr-only">
              Only admins can add or remove members
            </span>
            <input
              type="checkbox"
              disabled={disabled}
              checked={memberPolicy === MMPolicy.ADMINS_ONLY}
              onChange={(e) =>
                setMemberPolicy(
                  e.target.checked
                    ? MMPolicy.ADMINS_ONLY
                    : MMPolicy.ANY_MEMBER_CAN_INVITE,
                )
              }
              className="peer sr-only"
            />
            <span
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-200 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-in-out peer-checked:bg-blue-600 peer-checked:after:translate-x-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 dark:bg-gray-700 dark:after:bg-gray-100 dark:peer-checked:bg-blue-500"
              aria-hidden="true"
            />
            <span className="min-w-0 text-sm text-gray-900 dark:text-gray-100">
              Only admins can add or remove members.
            </span>
          </label>
        </div>
      </section>

      {packingEnabled && (
        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <EventSettingsSectionHeading>
            Packing settings
          </EventSettingsSectionHeading>
          <div className="mt-4 space-y-6">
            <div>
              <EventSettingsSubsectionHeading>
                Packing list visibility
              </EventSettingsSubsectionHeading>
              <fieldset disabled={disabled} className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="plv"
                    checked={packingVis === PLVis.URL_PUBLIC}
                    onChange={() => setPackingVis(PLVis.URL_PUBLIC)}
                    className="mt-1"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    Anyone with the share link can view and edit the list.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="plv"
                    checked={packingVis === PLVis.MEMBERS_ONLY}
                    onChange={() => setPackingVis(PLVis.MEMBERS_ONLY)}
                    className="mt-1"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    Members only.{" "}
                    <em>
                      Previously shared public links will stop working for
                      non-members.
                    </em>
                  </span>
                </label>
              </fieldset>
            </div>

            <div className="pt-1">
              <label className="flex cursor-pointer items-center gap-3">
                <span className="sr-only">Catalog admin approval</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={suggestionApproval}
                  onChange={(e) => setSuggestionApproval(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-200 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-in-out peer-checked:bg-blue-600 peer-checked:after:translate-x-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 dark:bg-gray-700 dark:after:bg-gray-100 dark:peer-checked:bg-blue-500"
                  aria-hidden="true"
                />
                <span className="min-w-0 text-sm text-gray-900 dark:text-gray-100">
                  Require admin approval before catalog suggestions from
                  participants go live on the shared list.
                </span>
              </label>
            </div>
          </div>
        </section>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={disabled || !isDirty}
            onClick={save}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSavePending ? "Saving…" : "Save settings"}
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
      )}

      <EventOptionalFeaturesSection
        eventId={eventId}
        disabled={disabled}
        packingEnabled={packingEnabled}
        setPackingEnabled={setPackingEnabled}
        ridesEnabled={ridesEnabled}
        setRidesEnabled={setRidesEnabled}
        taskBoardEnabled={taskBoardEnabled}
        setTaskBoardEnabled={setTaskBoardEnabled}
        onClearBannerError={() => setError(null)}
        onBannerError={(message) => setError(message)}
        onPendingChange={setFeatureOpsPending}
      />

      {error && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {showEventNotificationPreferences && (
        <section className="border-t border-gray-200 pt-8 dark:border-gray-700">
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <EventSettingsSectionHeading>
              Notifications for this event
            </EventSettingsSectionHeading>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Optional overrides to your account notification preferences.
            </p>
            <div className="mt-4">
              <EventNotificationPreferencesForm
                eventId={eventId}
                packingEnabled={packingEnabled}
                ridesEnabled={ridesEnabled}
                taskBoardEnabled={taskBoardEnabled}
              />
            </div>
          </div>
        </section>
      )}

      {isCreator && (
        <div className="border-t border-gray-200 pt-8 dark:border-gray-700">
          <EventSettingsSectionHeading level="danger">
            Danger zone
          </EventSettingsSectionHeading>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Only the event creator can delete the event. Other admins cannot
            delete it.
          </p>
          <div className="mt-4">
            <DeleteEventPanel eventId={eventId} eventTitle={eventTitle} />
          </div>
        </div>
      )}
    </div>
  );
}
