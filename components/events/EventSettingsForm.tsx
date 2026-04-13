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

type EventSettingsFormProps = {
  eventId: string;
  eventTitle: string;
  canEdit: boolean;
  isCreator: boolean;
  initial: {
    memberManagementPolicy: MemberManagementPolicy;
    packingListVisibility: PackingListVisibility;
    suggestionApprovalRequired: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMemberPolicy(initial.memberManagementPolicy);
    setPackingVis(initial.packingListVisibility);
    setSuggestionApproval(initial.suggestionApprovalRequired);
  }, [
    initial.memberManagementPolicy,
    initial.packingListVisibility,
    initial.suggestionApprovalRequired,
  ]);

  function save() {
    if (!canEdit) return;
    setError(null);
    setSavedFlash(false);
    startTransition(async () => {
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

  const disabled = !canEdit || isPending;

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
        <fieldset disabled={disabled} className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="mmp"
              checked={memberPolicy === MMPolicy.ANY_MEMBER_CAN_INVITE}
              onChange={() => setMemberPolicy(MMPolicy.ANY_MEMBER_CAN_INVITE)}
              className="mt-1"
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">
              Any member can add or remove other <strong>members</strong>{" "}
              (admins still follow hierarchy rules).
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="mmp"
              checked={memberPolicy === MMPolicy.ADMINS_ONLY}
              onChange={() => setMemberPolicy(MMPolicy.ADMINS_ONLY)}
              className="mt-1"
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">
              Only admins can add or remove members or change roles (except
              promotions, which any admin can still do for members).
            </span>
          </label>
        </fieldset>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Packing list visibility
        </h3>
        <fieldset disabled={disabled} className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="plv"
              checked={packingVis === PLVis.URL_PUBLIC}
              onChange={() => setPackingVis(PLVis.URL_PUBLIC)}
              className="mt-1"
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">
              Anyone with the share link can open the list (current default).
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
              <strong>Members only</strong> — others are sent to sign-in or
              blocked. Previously shared public links will stop working for
              non-members.
            </span>
          </label>
        </fieldset>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Suggestions
        </h3>
        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            disabled={disabled}
            checked={suggestionApproval}
            onChange={(e) => setSuggestionApproval(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-gray-800 dark:text-gray-200">
            Require admin approval before catalog ideas from participants go
            live on the shared list.
          </span>
        </label>
      </section>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save settings"}
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
