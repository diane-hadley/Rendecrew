"use client";

import { LiveList, LiveObject } from "@liveblocks/client";
import { useMutation, useStorage, useSyncStatus } from "@liveblocks/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

      <ul className="space-y-3">
        {items.map((item, index) => {
          const isMine = authUser
            ? item.claimedByUserId === authUser.dbUserId
            : Boolean(guestDisplayName && item.claimedByName === guestDisplayName && !item.claimedByUserId);
          const claimedLabel = item.claimedByUserId
            ? item.claimedByName ?? "Member"
            : item.claimedByName
              ? item.claimedByName
              : null;

          return (
            <li
              key={item.id}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-1 flex-col gap-2 min-w-0">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) =>
                      updateName({ index, name: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                    aria-label="Item name"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">Qty</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        value={item.quantity ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateQuantity({
                            index,
                            quantity: v === "" ? null : Math.max(0, parseInt(v, 10) || 0),
                          });
                        }}
                        className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.packed}
                        onChange={(e) =>
                          setPacked({ index, packed: e.target.checked })
                        }
                      />
                      Packed
                    </label>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleClaim(index)}
                    disabled={!authUser && !guestDisplayName}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {isMine ? "Unclaim" : "I’ll bring this"}
                  </button>
                  {claimedLabel && !isMine && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 text-right">
                      Claimed by {claimedLabel}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {isMine && !authUser && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Add your email (optional) so we can link this to your Rendecrew
                    account if you sign up later.
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={emailDrafts[item.id] ?? item.claimedByEmail ?? ""}
                      onChange={(e) =>
                        setEmailDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                      }
                      className="flex-1 min-w-[12rem] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => {
                        const raw =
                          emailDrafts[item.id] ?? item.claimedByEmail ?? "";
                        const trimmed = raw.trim();
                        setItemEmail({
                          index,
                          email: trimmed === "" ? null : trimmed.toLowerCase(),
                        });
                      }}
                    >
                      Save email
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

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
