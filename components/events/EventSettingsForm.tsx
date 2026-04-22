"use client";

import {
  MemberManagementPolicy as MMPolicy,
  PackingListVisibility as PLVis,
  type MemberManagementPolicy,
  type PackingListVisibility,
} from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  disableEventPackingFeature,
  disableEventRidesFeature,
  disableEventTaskBoardFeature,
  enableEventRidesFeature,
  enableEventTaskBoardFeature,
} from "@/app/actions/event-optional-features";
import { enablePackingListForEvent } from "@/app/actions/packing-list";
import { updateEventSettings } from "@/app/actions/event-settings";
import { DeleteEventPanel } from "./DeleteEventPanel";
import { EventNotificationPreferencesForm } from "./EventNotificationPreferencesForm";

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
  const [showConfirmDisablePacking, setShowConfirmDisablePacking] =
    useState(false);
  const [showConfirmDisableRides, setShowConfirmDisableRides] = useState(false);
  const [showConfirmDisableTaskBoard, setShowConfirmDisableTaskBoard] =
    useState(false);
  const [packingDisableError, setPackingDisableError] = useState<string | null>(
    null,
  );
  const [ridesDisableError, setRidesDisableError] = useState<string | null>(
    null,
  );
  const [taskBoardDisableError, setTaskBoardDisableError] = useState<
    string | null
  >(null);
  const [isSavePending, startSaveTransition] = useTransition();
  const [isPackingFeaturePending, startPackingFeatureTransition] =
    useTransition();
  const [isRidesFeaturePending, startRidesFeatureTransition] = useTransition();
  const [isTaskBoardFeaturePending, startTaskBoardFeatureTransition] =
    useTransition();

  useEffect(() => {
    setMemberPolicy(initial.memberManagementPolicy);
    setPackingVis(initial.packingListVisibility);
    setSuggestionApproval(initial.suggestionApprovalRequired);
    setPackingEnabled(initial.packingEnabled);
    setRidesEnabled(initial.ridesEnabled);
    setTaskBoardEnabled(initial.taskBoardEnabled);
    if (!initial.packingEnabled) {
      setShowConfirmDisablePacking(false);
      setPackingDisableError(null);
    }
    if (!initial.ridesEnabled) {
      setShowConfirmDisableRides(false);
      setRidesDisableError(null);
    }
    if (!initial.taskBoardEnabled) {
      setShowConfirmDisableTaskBoard(false);
      setTaskBoardDisableError(null);
    }
  }, [
    initial.memberManagementPolicy,
    initial.packingListVisibility,
    initial.suggestionApprovalRequired,
    initial.packingEnabled,
    initial.ridesEnabled,
    initial.taskBoardEnabled,
  ]);

  function save() {
    if (!canEdit) return;
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

  const isFeaturePending =
    isPackingFeaturePending ||
    isRidesFeaturePending ||
    isTaskBoardFeaturePending;
  const disabled = !canEdit || isSavePending || isFeaturePending;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Settings
        </h2>
        {!canEdit && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Only admins can change these settings. You can view the current
            configuration below.
          </p>
        )}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Member management
        </h3>
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
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-200 transition peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-in-out peer-checked:after:translate-x-5 dark:bg-gray-700 dark:peer-checked:bg-blue-500 dark:after:bg-gray-100"
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
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Packing settings
          </h3>
          <div className="mt-4 space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Packing list visibility
              </p>
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
                    Anyone with the share link can open the list (current
                    default).
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
                    <strong>Members only</strong> — others are sent to sign-in
                    or blocked. Previously shared public links will stop working
                    for non-members.
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
                  className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-200 transition peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-in-out peer-checked:after:translate-x-5 dark:bg-gray-700 dark:peer-checked:bg-blue-500 dark:after:bg-gray-100"
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

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Optional features
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Turn event modules on or off. Disabling a feature removes its tab and
          permanently deletes stored data for that feature.
        </p>
        <ul className="mt-6 divide-y divide-gray-200 dark:divide-gray-700">
          <li className="space-y-3 pb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-1">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Shared packing list
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Collaborative list with a Packing list tab, share link, and
                  optional catalog suggestions.
                </p>
              </div>
              <div className="shrink-0">
                {packingEnabled ? (
                  !showConfirmDisablePacking ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setError(null);
                        setPackingDisableError(null);
                        setShowConfirmDisableRides(false);
                        setRidesDisableError(null);
                        setShowConfirmDisablePacking(true);
                      }}
                      className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:ring-offset-gray-800"
                    >
                      Disable
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setError(null);
                      startPackingFeatureTransition(async () => {
                        const r = await enablePackingListForEvent(eventId);
                        if (!r.ok) {
                          setError(r.error);
                          return;
                        }
                        setPackingEnabled(true);
                        router.refresh();
                      });
                    }}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {isPackingFeaturePending ? "Enabling…" : "Enable"}
                  </button>
                )}
              </div>
            </div>
            {packingEnabled && showConfirmDisablePacking ? (
              <div
                className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
                role="region"
                aria-label="Confirm disable shared packing list"
              >
                <p className="text-sm font-medium text-red-900 dark:text-red-200">
                  Disable shared packing list?
                </p>
                <p className="text-sm text-red-800 dark:text-red-300">
                  This permanently deletes the collaborative list (items and
                  sign-ups), suggestions, personal packing copies linked to this
                  event, and related data. This cannot be undone.
                </p>
                {packingDisableError && (
                  <p
                    className="rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-gray-900/80 dark:text-red-400"
                    role="alert"
                  >
                    {packingDisableError}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isPackingFeaturePending}
                    onClick={() => {
                      setPackingDisableError(null);
                      setShowConfirmDisablePacking(false);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isPackingFeaturePending}
                    onClick={() => {
                      setPackingDisableError(null);
                      startPackingFeatureTransition(async () => {
                        const r = await disableEventPackingFeature(eventId);
                        if (!r.ok) {
                          setPackingDisableError(r.error);
                          return;
                        }
                        setShowConfirmDisablePacking(false);
                        setPackingEnabled(false);
                        router.refresh();
                      });
                    }}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-900"
                  >
                    {isPackingFeaturePending
                      ? "Disabling…"
                      : "Disable permanently"}
                  </button>
                </div>
              </div>
            ) : null}
          </li>
          <li className="space-y-3 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-1">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Rides coordination
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Rides tab for drivers, cars, and passenger sign-ups.
                </p>
              </div>
              <div className="shrink-0">
                {ridesEnabled ? (
                  !showConfirmDisableRides ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setError(null);
                        setRidesDisableError(null);
                        setShowConfirmDisablePacking(false);
                        setPackingDisableError(null);
                        setShowConfirmDisableRides(true);
                      }}
                      className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:ring-offset-gray-800"
                    >
                      Disable
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setError(null);
                      startRidesFeatureTransition(async () => {
                        const r = await enableEventRidesFeature(eventId);
                        if (!r.ok) {
                          setError(r.error);
                          return;
                        }
                        setRidesEnabled(true);
                        router.refresh();
                      });
                    }}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {isRidesFeaturePending ? "Enabling…" : "Enable"}
                  </button>
                )}
              </div>
            </div>
            {ridesEnabled && showConfirmDisableRides ? (
              <div
                className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
                role="region"
                aria-label="Confirm disable rides coordination"
              >
                <p className="text-sm font-medium text-red-900 dark:text-red-200">
                  Disable rides coordination?
                </p>
                <p className="text-sm text-red-800 dark:text-red-300">
                  This permanently deletes all ride cars, passengers, custom
                  ride fields, and related data. This cannot be undone.
                </p>
                {ridesDisableError && (
                  <p
                    className="rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-gray-900/80 dark:text-red-400"
                    role="alert"
                  >
                    {ridesDisableError}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isRidesFeaturePending}
                    onClick={() => {
                      setRidesDisableError(null);
                      setShowConfirmDisableRides(false);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isRidesFeaturePending}
                    onClick={() => {
                      setRidesDisableError(null);
                      startRidesFeatureTransition(async () => {
                        const r = await disableEventRidesFeature(eventId);
                        if (!r.ok) {
                          setRidesDisableError(r.error);
                          return;
                        }
                        setShowConfirmDisableRides(false);
                        setRidesEnabled(false);
                        router.refresh();
                      });
                    }}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-900"
                  >
                    {isRidesFeaturePending
                      ? "Disabling…"
                      : "Disable permanently"}
                  </button>
                </div>
              </div>
            ) : null}
          </li>
          <li className="space-y-3 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-1">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Task board
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tasks tab for group to-dos with multi-assignee completion.
                </p>
              </div>
              <div className="shrink-0">
                {taskBoardEnabled ? (
                  !showConfirmDisableTaskBoard ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setError(null);
                        setTaskBoardDisableError(null);
                        setShowConfirmDisablePacking(false);
                        setPackingDisableError(null);
                        setShowConfirmDisableRides(false);
                        setRidesDisableError(null);
                        setShowConfirmDisableTaskBoard(true);
                      }}
                      className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:ring-offset-gray-800"
                    >
                      Disable
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setError(null);
                      startTaskBoardFeatureTransition(async () => {
                        const r = await enableEventTaskBoardFeature(eventId);
                        if (!r.ok) {
                          setError(r.error);
                          return;
                        }
                        setTaskBoardEnabled(true);
                        router.refresh();
                      });
                    }}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {isTaskBoardFeaturePending ? "Enabling…" : "Enable"}
                  </button>
                )}
              </div>
            </div>
            {taskBoardEnabled && showConfirmDisableTaskBoard ? (
              <div
                className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
                role="region"
                aria-label="Confirm disable task board"
              >
                <p className="text-sm font-medium text-red-900 dark:text-red-200">
                  Disable task board?
                </p>
                <p className="text-sm text-red-800 dark:text-red-300">
                  This permanently deletes all tasks, assignments, and
                  completion history for this event. This cannot be undone.
                </p>
                {taskBoardDisableError && (
                  <p
                    className="rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-gray-900/80 dark:text-red-400"
                    role="alert"
                  >
                    {taskBoardDisableError}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isTaskBoardFeaturePending}
                    onClick={() => {
                      setTaskBoardDisableError(null);
                      setShowConfirmDisableTaskBoard(false);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isTaskBoardFeaturePending}
                    onClick={() => {
                      setTaskBoardDisableError(null);
                      startTaskBoardFeatureTransition(async () => {
                        const r = await disableEventTaskBoardFeature(eventId);
                        if (!r.ok) {
                          setTaskBoardDisableError(r.error);
                          return;
                        }
                        setShowConfirmDisableTaskBoard(false);
                        setTaskBoardEnabled(false);
                        router.refresh();
                      });
                    }}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-900"
                  >
                    {isTaskBoardFeaturePending
                      ? "Disabling…"
                      : "Disable permanently"}
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        </ul>
      </section>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={isSavePending || isFeaturePending}
            onClick={save}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSavePending ? "Saving…" : "Save settings"}
          </button>
          {savedFlash && (
            <span className="text-sm text-green-700 dark:text-green-400">
              Saved.
            </span>
          )}
        </div>
      )}

      {error && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      <section className="border-t border-gray-200 pt-8 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Notifications for this event
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Optional overrides to your account defaults. “Account default” follows
          what you set under Dashboard → Settings.
        </p>
        <div className="mt-4">
          <EventNotificationPreferencesForm eventId={eventId} />
        </div>
      </section>

      {isCreator && (
        <div className="border-t border-gray-200 pt-8 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
            Danger zone
          </h3>
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
