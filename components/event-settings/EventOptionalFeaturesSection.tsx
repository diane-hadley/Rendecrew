"use client";

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
import { EventSettingsSectionHeading } from "./EventSettingsSectionHeading";

type FeatureId = "packing" | "rides" | "taskBoard";

const FEATURE_IDS: FeatureId[] = ["packing", "rides", "taskBoard"];

const FEATURE_COPY: Record<
  FeatureId,
  {
    title: string;
    confirmAriaLabel: string;
    confirmTitle: string;
    confirmBody: string;
  }
> = {
  packing: {
    title: "Collaborative packing list",
    confirmAriaLabel: "Confirm disable shared packing list",
    confirmTitle: "Disable shared packing list?",
    confirmBody:
      "This permanently deletes the collaborative list (items and sign-ups), suggestions, personal packing copies linked to this event, and related data. This cannot be undone.",
  },
  rides: {
    title: "Rides coordination",
    confirmAriaLabel: "Confirm disable rides coordination",
    confirmTitle: "Disable rides coordination?",
    confirmBody:
      "This permanently deletes all ride cars, passengers, custom ride fields, and related data. This cannot be undone.",
  },
  taskBoard: {
    title: "Task board for group to-dos",
    confirmAriaLabel: "Confirm disable task board",
    confirmTitle: "Disable task board?",
    confirmBody:
      "This permanently deletes all tasks, assignments, and completion history for this event. This cannot be undone.",
  },
};

const DISABLE_BTN_CLASS =
  "rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:ring-offset-gray-800";

const ENABLE_BTN_CLASS =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600";

const CANCEL_BTN_CLASS =
  "rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900";

const DESTROY_BTN_CLASS =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-900";

export type EventOptionalFeaturesSectionProps = {
  eventId: string;
  disabled: boolean;
  packingEnabled: boolean;
  setPackingEnabled: (v: boolean) => void;
  ridesEnabled: boolean;
  setRidesEnabled: (v: boolean) => void;
  taskBoardEnabled: boolean;
  setTaskBoardEnabled: (v: boolean) => void;
  onClearBannerError: () => void;
  onBannerError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
};

export function EventOptionalFeaturesSection({
  eventId,
  disabled,
  packingEnabled,
  setPackingEnabled,
  ridesEnabled,
  setRidesEnabled,
  taskBoardEnabled,
  setTaskBoardEnabled,
  onClearBannerError,
  onBannerError,
  onPendingChange,
}: EventOptionalFeaturesSectionProps) {
  const router = useRouter();
  const [confirmDisable, setConfirmDisable] = useState<FeatureId | null>(null);
  const [disableErrors, setDisableErrors] = useState<
    Record<FeatureId, string | null>
  >({ packing: null, rides: null, taskBoard: null });

  const [isPackingFeaturePending, startPackingFeatureTransition] =
    useTransition();
  const [isRidesFeaturePending, startRidesFeatureTransition] = useTransition();
  const [isTaskBoardFeaturePending, startTaskBoardFeatureTransition] =
    useTransition();

  const anyFeaturePending =
    isPackingFeaturePending ||
    isRidesFeaturePending ||
    isTaskBoardFeaturePending;

  useEffect(() => {
    onPendingChange(anyFeaturePending);
  }, [anyFeaturePending, onPendingChange]);

  useEffect(() => {
    if (!packingEnabled) {
      setConfirmDisable((k) => (k === "packing" ? null : k));
      setDisableErrors((e) => ({ ...e, packing: null }));
    }
  }, [packingEnabled]);

  useEffect(() => {
    if (!ridesEnabled) {
      setConfirmDisable((k) => (k === "rides" ? null : k));
      setDisableErrors((e) => ({ ...e, rides: null }));
    }
  }, [ridesEnabled]);

  useEffect(() => {
    if (!taskBoardEnabled) {
      setConfirmDisable((k) => (k === "taskBoard" ? null : k));
      setDisableErrors((e) => ({ ...e, taskBoard: null }));
    }
  }, [taskBoardEnabled]);

  function enabledFor(id: FeatureId) {
    if (id === "packing") return packingEnabled;
    if (id === "rides") return ridesEnabled;
    return taskBoardEnabled;
  }

  function setDisableError(id: FeatureId, message: string | null) {
    setDisableErrors((prev) => ({ ...prev, [id]: message }));
  }

  function openConfirm(id: FeatureId) {
    onClearBannerError();
    setDisableErrors({ packing: null, rides: null, taskBoard: null });
    setConfirmDisable(id);
  }

  function closeConfirm() {
    setConfirmDisable(null);
  }

  async function runEnable(id: FeatureId) {
    onClearBannerError();
    if (id === "packing") {
      return enablePackingListForEvent(eventId);
    }
    if (id === "rides") {
      return enableEventRidesFeature(eventId);
    }
    return enableEventTaskBoardFeature(eventId);
  }

  async function runDisable(id: FeatureId) {
    if (id === "packing") {
      return disableEventPackingFeature(eventId);
    }
    if (id === "rides") {
      return disableEventRidesFeature(eventId);
    }
    return disableEventTaskBoardFeature(eventId);
  }

  function startFeatureTransition(id: FeatureId, run: () => void) {
    if (id === "packing") startPackingFeatureTransition(run);
    else if (id === "rides") startRidesFeatureTransition(run);
    else startTaskBoardFeatureTransition(run);
  }

  function isPendingFor(id: FeatureId) {
    if (id === "packing") return isPackingFeaturePending;
    if (id === "rides") return isRidesFeaturePending;
    return isTaskBoardFeaturePending;
  }

  function setEnabledFor(id: FeatureId, v: boolean) {
    if (id === "packing") setPackingEnabled(v);
    else if (id === "rides") setRidesEnabled(v);
    else setTaskBoardEnabled(v);
  }

  return (
    <section className="border-t border-gray-200 pt-8 dark:border-gray-700">
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <EventSettingsSectionHeading>
          Optional features
        </EventSettingsSectionHeading>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Turn event modules on or off. Disabling a feature removes its tab and
          permanently deletes stored data for that feature.
        </p>
        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700 [&>li:first-child]:pt-0 [&>li:last-child]:pb-0 [&>li]:space-y-3 [&>li]:py-4">
          {FEATURE_IDS.map((id) => {
            const copy = FEATURE_COPY[id];
            const enabled = enabledFor(id);
            const pending = isPendingFor(id);
            const showConfirm = enabled && confirmDisable === id;

            return (
              <li key={id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {copy.title}
                    </h4>
                  </div>
                  <div className="shrink-0">
                    {enabled ? (
                      !showConfirm ? (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => openConfirm(id)}
                          className={DISABLE_BTN_CLASS}
                        >
                          Disable
                        </button>
                      ) : null
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onClearBannerError();
                          startFeatureTransition(id, async () => {
                            const r = await runEnable(id);
                            if (!r.ok) {
                              onBannerError(r.error);
                              return;
                            }
                            setEnabledFor(id, true);
                            router.refresh();
                          });
                        }}
                        className={ENABLE_BTN_CLASS}
                      >
                        {pending ? "Enabling…" : "Enable"}
                      </button>
                    )}
                  </div>
                </div>
                {showConfirm ? (
                  <div
                    className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
                    role="region"
                    aria-label={copy.confirmAriaLabel}
                  >
                    <p className="text-sm font-medium text-red-900 dark:text-red-200">
                      {copy.confirmTitle}
                    </p>
                    <p className="text-sm text-red-800 dark:text-red-300">
                      {copy.confirmBody}
                    </p>
                    {disableErrors[id] ? (
                      <p
                        className="rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-gray-900/80 dark:text-red-400"
                        role="alert"
                      >
                        {disableErrors[id]}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setDisableError(id, null);
                          closeConfirm();
                        }}
                        className={CANCEL_BTN_CLASS}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setDisableError(id, null);
                          startFeatureTransition(id, async () => {
                            const r = await runDisable(id);
                            if (!r.ok) {
                              setDisableError(id, r.error);
                              return;
                            }
                            closeConfirm();
                            setEnabledFor(id, false);
                            router.refresh();
                          });
                        }}
                        className={DESTROY_BTN_CLASS}
                      >
                        {pending ? "Disabling…" : "Disable permanently"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
