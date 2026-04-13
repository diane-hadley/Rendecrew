"use client";

import { EventMemberRole, MemberManagementPolicy } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  addEventMember,
  demoteAdminToMember,
  listEventMembers,
  promoteMemberToAdmin,
  removeEventMember,
  searchUsersToAddToEvent,
  type EventMemberListItem,
} from "@/app/actions/event-members";
import {
  actorCanAddMembers,
  authorizeDemoteAdmin,
  authorizePromoteToAdmin,
  authorizeRemoveOrLeaveMember,
} from "@/lib/event-member-policy";
import { formatEventRoleLabel } from "@/lib/event-role-utils";

type EventMembersSectionProps = {
  eventId: string;
  createdById: string;
  currentUserId: string;
  actorRole: EventMemberRole;
  memberManagementPolicy: MemberManagementPolicy;
  initialMembers: EventMemberListItem[];
};

function formatJoined(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function EventMembersSection({
  eventId,
  createdById,
  currentUserId,
  actorRole,
  memberManagementPolicy,
  initialMembers,
}: EventMembersSectionProps) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  const canAdd = actorCanAddMembers(actorRole, memberManagementPolicy);

  async function refreshMembers() {
    const r = await listEventMembers(eventId);
    if (r.ok) setMembers(r.members);
  }

  function runAction(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    setActionError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      await refreshMembers();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Members
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Only people who already have a Rendecrew account can be added. Use
          search to pick the right person.
        </p>
      </div>

      {canAdd && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Add member
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="min-w-[12rem] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              disabled={isPending || query.trim().length < 2}
              onClick={() => {
                setSearchError(null);
                startTransition(async () => {
                  const r = await searchUsersToAddToEvent(eventId, query);
                  if (!r.ok) {
                    setSearchHits([]);
                    setSearchError(r.error);
                    return;
                  }
                  setSearchHits(r.users);
                  setSearchError(null);
                });
              }}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Search
            </button>
          </div>
          {searchError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {searchError}
            </p>
          )}
          {searchHits.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700">
              {searchHits.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {u.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {u.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      runAction(() => addEventMember(eventId, u.id))
                    }
                    className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {actionError && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Member
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Role
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Joined
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {members.map((m) => {
              const promoteOk =
                authorizePromoteToAdmin(actorRole, m.role).ok &&
                m.role === EventMemberRole.member;
              const demoteOk = authorizeDemoteAdmin(
                currentUserId,
                createdById,
                m.userId,
                m.role,
              ).ok;
              const removeAuth = authorizeRemoveOrLeaveMember({
                actorUserId: currentUserId,
                actorRole,
                targetUserId: m.userId,
                targetRole: m.role,
                eventCreatorId: createdById,
                policy: memberManagementPolicy,
              });
              const hideRemoveForCreatorRow =
                m.role === EventMemberRole.creator &&
                m.userId !== currentUserId;
              const removeLabel =
                m.userId === currentUserId ? "Leave" : "Remove";
              const removeTitle = removeAuth.ok
                ? removeLabel === "Leave"
                  ? "Leave this event"
                  : "Remove from event"
                : removeAuth.error;

              return (
                <tr key={m.membershipId}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {m.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {m.email}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                      {formatEventRoleLabel(m.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {formatJoined(m.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {promoteOk && (
                        <button
                          type="button"
                          disabled={isPending}
                          title="Promote to admin"
                          onClick={() =>
                            runAction(() =>
                              promoteMemberToAdmin(eventId, m.userId),
                            )
                          }
                          className="text-xs font-medium text-violet-600 hover:underline disabled:opacity-50 dark:text-violet-400"
                        >
                          Make admin
                        </button>
                      )}
                      {demoteOk && (
                        <button
                          type="button"
                          disabled={isPending}
                          title="Demote to member"
                          onClick={() =>
                            runAction(() =>
                              demoteAdminToMember(eventId, m.userId),
                            )
                          }
                          className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50 dark:text-amber-400"
                        >
                          Demote
                        </button>
                      )}
                      {!hideRemoveForCreatorRow && (
                        <button
                          type="button"
                          disabled={isPending || !removeAuth.ok}
                          title={removeTitle}
                          onClick={() =>
                            removeAuth.ok &&
                            runAction(() =>
                              removeEventMember(eventId, m.userId),
                            )
                          }
                          className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
                        >
                          {removeLabel}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Only the event creator can remove or demote another admin. Any admin can
        promote members. The creator cannot leave without deleting the event.
      </p>
    </div>
  );
}
