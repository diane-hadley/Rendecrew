"use client";

import { LiveList, LiveObject } from "@liveblocks/client";
import { useMutation, useStorage, useSyncStatus } from "@liveblocks/react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { syncPackingListToDatabase } from "@/app/actions/packing-list";
import type { PackingItemPayload } from "@/lib/packing-list";

type AuthUser = { dbUserId: string; name: string; email: string };

function storageToPayload(
  items:
    | readonly {
        id: string;
        name: string;
        quantity: number | null;
        packed: boolean;
        claimedByName: string | null;
        claimedByEmail: string | null;
        claimedByUserId: string | null;
      }[]
    | undefined
    | null,
): PackingItemPayload[] {
  if (!items?.length) return [];
  return items.map((row) => ({
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    packed: row.packed,
    claimedByName: row.claimedByName,
    claimedByEmail: row.claimedByEmail,
    claimedByUserId: row.claimedByUserId,
  }));
}

export function PackingListEditor({
  roomId,
  authUser,
  guestDisplayName,
}: {
  roomId: string;
  authUser: AuthUser | null;
  guestDisplayName: string | null;
}) {
  const ctxRef = useRef({ authUser, guestDisplayName });
  ctxRef.current = { authUser, guestDisplayName };

  const rawItems = useStorage((root) => root.items);
  const syncStatus = useSyncStatus({ smooth: true });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersist = useCallback(
    (payload: PackingItemPayload[]) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(async () => {
        persistTimer.current = null;
        const result = await syncPackingListToDatabase(roomId, payload);
        if (!result.ok) {
          setSaveError(result.error);
        } else {
          setSaveError(null);
        }
      }, 900);
    },
    [roomId],
  );

  useEffect(() => {
    if (rawItems === undefined || rawItems === null) {
      return () => {
        if (persistTimer.current) clearTimeout(persistTimer.current);
      };
    }
    const payload = storageToPayload(rawItems);
    schedulePersist(payload);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [rawItems, schedulePersist]);

  const addItem = useMutation(
    ({ storage }) => {
      const items = storage.get("items");
      items.push(
        new LiveObject({
          id: crypto.randomUUID(),
          name: "New item",
          quantity: null,
          packed: false,
          claimedByName: null,
          claimedByEmail: null,
          claimedByUserId: null,
        }),
      );
    },
    [],
  );

  const removeItem = useMutation(
    ({ storage }, index: number) => {
      const items = storage.get("items");
      items.delete(index);
    },
    [],
  );

  const updateName = useMutation(
    ({ storage }, { index, name }: { index: number; name: string }) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (row) row.set("name", name);
    },
    [],
  );

  const updateQuantity = useMutation(
    ({ storage }, { index, quantity }: { index: number; quantity: number | null }) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (row) row.set("quantity", quantity);
    },
    [],
  );

  const setPacked = useMutation(
    ({ storage }, { index, packed }: { index: number; packed: boolean }) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (row) row.set("packed", packed);
    },
    [],
  );

  const toggleClaim = useMutation(
    ({ storage }, index: number) => {
      const { authUser: au, guestDisplayName: gn } = ctxRef.current;
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;

      const curUserId = row.get("claimedByUserId");
      const curName = row.get("claimedByName");

      if (au) {
        const mine = curUserId === au.dbUserId;
        if (mine) {
          row.set("claimedByUserId", null);
          row.set("claimedByName", null);
          row.set("claimedByEmail", null);
        } else {
          row.set("claimedByUserId", au.dbUserId);
          row.set("claimedByName", au.name);
          row.set("claimedByEmail", au.email.trim().toLowerCase());
        }
        return;
      }

      if (!gn) return;
      const mineGuest = !curUserId && curName === gn;
      if (mineGuest) {
        row.set("claimedByName", null);
        row.set("claimedByEmail", null);
      } else {
        row.set("claimedByUserId", null);
        row.set("claimedByName", gn);
      }
    },
    [],
  );

  const setItemEmail = useMutation(
    ({ storage }, { index, email }: { index: number; email: string | null }) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (row) row.set("claimedByEmail", email);
    },
    [],
  );

  if (rawItems === undefined || rawItems === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">Connecting…</p>
    );
  }

  const items = rawItems;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
        <span>
          {syncStatus === "synchronizing" ? "Syncing…" : "Up to date"}
        </span>
        {saveError && (
          <span className="text-red-600 dark:text-red-400" role="alert">
            {saveError}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-sm tabular-nums">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-900">
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300"
              >
                Item
              </th>
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 w-20"
              >
                Qty
              </th>
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 w-24"
              >
                Packed
              </th>
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 w-36"
              >
                Bringing
              </th>
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 min-w-[7rem]"
              >
                Claimed by
              </th>
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 w-24"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isMine = authUser
                ? item.claimedByUserId === authUser.dbUserId
                : Boolean(
                    guestDisplayName &&
                      item.claimedByName === guestDisplayName &&
                      !item.claimedByUserId,
                  );
              const claimedLabel = item.claimedByUserId
                ? (item.claimedByName ?? "Member")
                : item.claimedByName
                  ? item.claimedByName
                  : null;

              const cellBorder =
                "border border-gray-300 dark:border-gray-600 align-middle";

              return (
                <Fragment key={item.id}>
                  <tr className="bg-white hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900/80">
                    <td className={`${cellBorder} p-0`}>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          updateName({ index, name: e.target.value })
                        }
                        className="w-full min-w-[8rem] border-0 bg-transparent px-2 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-400"
                        aria-label="Item name"
                      />
                    </td>
                    <td className={`${cellBorder} p-0 text-center`}>
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        value={item.quantity ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateQuantity({
                            index,
                            quantity:
                              v === ""
                                ? null
                                : Math.max(0, parseInt(v, 10) || 0),
                          });
                        }}
                        className="w-full max-w-[5rem] border-0 bg-transparent px-2 py-2 text-center text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-400"
                        aria-label="Quantity"
                      />
                    </td>
                    <td className={`${cellBorder} p-0`}>
                      <label className="flex cursor-pointer items-center justify-center gap-2 px-2 py-2 text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={item.packed}
                          onChange={(e) =>
                            setPacked({ index, packed: e.target.checked })
                          }
                          className="rounded border-gray-300 dark:border-gray-600"
                          aria-label="Packed"
                        />
                      </label>
                    </td>
                    <td className={`${cellBorder} px-2 py-1.5`}>
                      <button
                        type="button"
                        onClick={() => toggleClaim(index)}
                        disabled={!authUser && !guestDisplayName}
                        className="w-full rounded border border-transparent bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        {isMine ? "Unclaim" : "I’ll bring this"}
                      </button>
                    </td>
                    <td className={`${cellBorder} px-2 py-2 text-gray-600 dark:text-gray-400`}>
                      {claimedLabel && !isMine ? (
                        <span className="text-xs">{claimedLabel}</span>
                      ) : isMine ? (
                        <span className="text-xs text-blue-700 dark:text-blue-300">
                          You
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`${cellBorder} px-2 py-1.5 text-center`}>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  {isMine && !authUser && (
                    <tr className="bg-gray-50 dark:bg-gray-900/60">
                      <td
                        colSpan={6}
                        className="border border-gray-300 dark:border-gray-600 px-3 py-2"
                      >
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                          Add your email (optional) so we can link this to your
                          Rendecrew account if you sign up later.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="email"
                            placeholder="you@example.com"
                            value={
                              emailDrafts[item.id] ??
                              item.claimedByEmail ??
                              ""
                            }
                            onChange={(e) =>
                              setEmailDrafts((d) => ({
                                ...d,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="min-w-[12rem] flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-950"
                          />
                          <button
                            type="button"
                            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => {
                              const raw =
                                emailDrafts[item.id] ??
                                item.claimedByEmail ??
                                "";
                              const trimmed = raw.trim();
                              setItemEmail({
                                index,
                                email:
                                  trimmed === ""
                                    ? null
                                    : trimmed.toLowerCase(),
                              });
                            }}
                          >
                            Save email
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => addItem()}
        className="rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        Add item
      </button>
    </div>
  );
}

export function buildInitialStorage(items: PackingItemPayload[]) {
  return {
    items: new LiveList(
      items.map(
        (i) =>
          new LiveObject({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            packed: i.packed,
            claimedByName: i.claimedByName,
            claimedByEmail: i.claimedByEmail,
            claimedByUserId: i.claimedByUserId,
          }),
      ),
    ),
  };
}
