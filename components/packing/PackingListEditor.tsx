"use client";

import { LiveList, LiveObject } from "@liveblocks/client";
import { useMutation, useStorage, useSyncStatus } from "@liveblocks/react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { syncPackingListToDatabase } from "@/app/actions/packing-list";
import type { PackingItemPayload } from "@/lib/packing-list";
import type {
  PackingItemStorage,
  PackingSignUpStorage,
} from "@/liveblocks.config";

type AuthUser = { dbUserId: string; name: string; email: string };

type StorageSignUp = {
  id: string;
  quantity: number | null;
  displayName: string;
  email: string | null;
  userId: string | null;
};

type StorageRow = {
  id: string;
  name: string;
  quantity: number | null;
  packed: boolean;
  signUps?: readonly StorageSignUp[] | null;
  claimedByName?: string | null;
  claimedByEmail?: string | null;
  claimedByUserId?: string | null;
  claimedQuantity?: number | null;
};

function readSignUps(row: StorageRow): StorageSignUp[] {
  if (Array.isArray(row.signUps) && row.signUps.length > 0) {
    return row.signUps.map((s) => ({
      id: s.id,
      quantity: s.quantity ?? null,
      displayName: s.displayName,
      email: s.email ?? null,
      userId: s.userId ?? null,
    }));
  }
  if (Array.isArray(row.signUps) && row.signUps.length === 0) {
    if (!row.claimedByName?.trim() && !row.claimedByUserId?.trim()) {
      return [];
    }
  }
  if (row.claimedByName?.trim() || row.claimedByUserId?.trim()) {
    const total = row.quantity;
    const cq = row.claimedQuantity;
    return [
      {
        id: `legacy-${row.id}`,
        quantity:
          typeof cq === "number"
            ? cq
            : typeof total === "number" && total > 0
              ? total
              : null,
        displayName: row.claimedByName?.trim() || "Member",
        email: row.claimedByEmail ?? null,
        userId: row.claimedByUserId?.trim() || null,
      },
    ];
  }
  if (Array.isArray(row.signUps)) return [];
  return [];
}

function storageToPayload(
  items: readonly StorageRow[] | undefined | null,
): PackingItemPayload[] {
  if (!items?.length) return [];
  return items.map((row) => ({
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    packed: row.packed,
    signUps: readSignUps(row).map((s) => ({
      id: s.id,
      quantity: s.quantity,
      displayName: s.displayName,
      email: s.email,
      userId: s.userId,
    })),
  }));
}

function allocatedSum(signUps: StorageSignUp[]): number {
  return signUps.reduce((a, s) => a + (s.quantity ?? 0), 0);
}

function remainingQuantity(
  total: number | null,
  signUps: StorageSignUp[],
): number | null {
  if (total == null) return null;
  return Math.max(0, total - allocatedSum(signUps));
}

function isMineSignUp(
  su: StorageSignUp,
  authUser: AuthUser | null,
  guestDisplayName: string | null,
): boolean {
  if (authUser) return su.userId === authUser.dbUserId;
  if (guestDisplayName)
    return !su.userId && su.displayName === guestDisplayName;
  return false;
}

function findMySignUp(
  signUps: StorageSignUp[],
  authUser: AuthUser | null,
  guestDisplayName: string | null,
): StorageSignUp | null {
  return signUps.find((s) => isMineSignUp(s, authUser, guestDisplayName)) ?? null;
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
  const migratedRef = useRef(false);

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

  const migrateLegacySignUps = useMutation(({ storage }) => {
    const items = storage.get("items");
    for (let i = 0; i < items.length; i++) {
      const row = items.get(i);
      if (!row) continue;
      if (row.get("signUps") != null) continue;
      const list = new LiveList<LiveObject<PackingSignUpStorage>>([]);
      const legacy = row as unknown as {
        get: (k: string) => unknown;
        set: (k: string, v: unknown) => void;
      };
      const ln = legacy.get("claimedByName") as string | null | undefined;
      const lu = legacy.get("claimedByUserId") as string | null | undefined;
      const le = legacy.get("claimedByEmail") as string | null | undefined;
      const lq = legacy.get("claimedQuantity") as number | null | undefined;
      const qty = row.get("quantity") as number | null;
      if (ln || lu) {
        list.push(
          new LiveObject({
            id: crypto.randomUUID(),
            quantity:
              typeof lq === "number"
                ? lq
                : typeof qty === "number" && qty > 0
                  ? qty
                  : null,
            displayName: (ln && String(ln).trim()) || "Member",
            email: le ?? null,
            userId: lu ?? null,
          }),
        );
      }
      row.set("signUps", list as never);
    }
  }, []);

  useEffect(() => {
    if (rawItems === undefined || rawItems === null) return;
    if (migratedRef.current) return;
    migratedRef.current = true;
    migrateLegacySignUps();
  }, [rawItems, migrateLegacySignUps]);

  useEffect(() => {
    if (rawItems === undefined || rawItems === null) {
      return () => {
        if (persistTimer.current) clearTimeout(persistTimer.current);
      };
    }
    const payload = storageToPayload(rawItems as StorageRow[]);
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
          signUps: new LiveList<LiveObject<PackingSignUpStorage>>([]),
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
      if (!row) return;
      row.set("quantity", quantity);
      if (quantity == null) return;
      const signUps = row.get("signUps");
      if (!signUps) return;
      let over = allocatedSum(snapshotSignUps(signUps)) - quantity;
      while (over > 0 && signUps.length > 0) {
        const lastIdx = signUps.length - 1;
        const su = signUps.get(lastIdx);
        if (!su) break;
        const q = (su.get("quantity") as number | null) ?? 1;
        if (q <= over) {
          over -= q;
          signUps.delete(lastIdx);
        } else {
          su.set("quantity", q - over);
          over = 0;
        }
      }
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

  const addMySignUp = useMutation(
    ({ storage }, index: number) => {
      const { authUser: au, guestDisplayName: gn } = ctxRef.current;
      if (!au && !gn?.trim()) return;
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;
      let signUps = row.get("signUps");
      if (!signUps) {
        const list = new LiveList<LiveObject<PackingSignUpStorage>>([]);
        row.set("signUps", list as never);
        signUps = list as never;
      }
      const g = gn?.trim() ?? null;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (au && s.get("userId") === au.dbUserId) return;
        if (!au && g && !s.get("userId") && s.get("displayName") === g) return;
      }
      const itemQty = row.get("quantity") as number | null;
      let sum = 0;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        sum += (s.get("quantity") as number | null) ?? 0;
      }
      const rem = itemQty != null ? Math.max(0, itemQty - sum) : null;
      if (itemQty != null && rem != null && rem < 1) return;

      signUps.push(
        new LiveObject({
          id: crypto.randomUUID(),
          quantity: itemQty != null ? rem : null,
          displayName: au ? au.name : g!,
          email: au ? au.email.trim().toLowerCase() : null,
          userId: au ? au.dbUserId : null,
        }),
      );
    },
    [],
  );

  const removeMySignUp = useMutation(
    ({ storage }, index: number) => {
      const { authUser: au, guestDisplayName: gn } = ctxRef.current;
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;
      const signUps = row.get("signUps");
      if (!signUps) return;
      const g = gn?.trim() ?? null;
      for (let i = signUps.length - 1; i >= 0; i--) {
        const s = signUps.get(i);
        if (!s) continue;
        if (au && s.get("userId") === au.dbUserId) {
          signUps.delete(i);
          return;
        }
        if (!au && g && !s.get("userId") && s.get("displayName") === g) {
          signUps.delete(i);
          return;
        }
      }
    },
    [],
  );

  const updateSignUpQuantity = useMutation(
    (
      { storage },
      {
        itemIndex,
        signUpId,
        quantity: nextQty,
      }: { itemIndex: number; signUpId: string; quantity: number | null },
    ) => {
      const items = storage.get("items");
      const row = items.get(itemIndex);
      if (!row) return;
      const signUps = row.get("signUps");
      if (!signUps) return;
      const itemQty = row.get("quantity") as number | null;
      let target: NonNullable<ReturnType<typeof signUps.get>> | null = null;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("id") === signUpId) {
          target = s;
          break;
        }
      }
      if (!target) return;

      let otherSum = 0;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("id") === signUpId) continue;
        otherSum += (s.get("quantity") as number | null) ?? 0;
      }
      const maxForMe =
        itemQty != null ? Math.max(1, itemQty - otherSum) : 999_999;
      if (itemQty != null) {
        const n =
          nextQty == null
            ? maxForMe
            : Math.max(1, Math.min(nextQty, maxForMe));
        target.set("quantity", n);
      } else {
        if (nextQty == null) target.set("quantity", null);
        else target.set("quantity", Math.max(1, Math.min(nextQty, maxForMe)));
      }
    },
    [],
  );

  const setSignUpEmail = useMutation(
    (
      { storage },
      {
        itemIndex,
        signUpId,
        email,
      }: { itemIndex: number; signUpId: string; email: string | null },
    ) => {
      const items = storage.get("items");
      const row = items.get(itemIndex);
      if (!row) return;
      const signUps = row.get("signUps");
      if (!signUps) return;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("id") === signUpId) {
          s.set("email", email);
          return;
        }
      }
    },
    [],
  );

  if (rawItems === undefined || rawItems === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">Connecting…</p>
    );
  }

  const items = rawItems as StorageRow[];

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
        <table className="w-full min-w-[880px] border-collapse text-sm tabular-nums">
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
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 w-28"
              >
                Filled
              </th>
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 w-36"
              >
                Sign up
              </th>
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 min-w-[10rem]"
              >
                Who&apos;s bringing
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
              const signUps = readSignUps(item);
              const total = item.quantity;
              const sum = allocatedSum(signUps);
              const rem = remainingQuantity(total, signUps);
              const mySu = findMySignUp(signUps, authUser, guestDisplayName);
              const canSignUpMore =
                authUser || guestDisplayName
                  ? total == null || (rem != null && rem >= 1)
                  : false;

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
                    <td className={`${cellBorder} px-2 py-2 text-center text-xs text-gray-600 dark:text-gray-400`}>
                      {total != null ? (
                        <div>
                          <div>
                            {sum} / {total}
                          </div>
                          {rem != null && rem > 0 && (
                            <div className="text-amber-700 dark:text-amber-400 mt-0.5">
                              {rem} left
                            </div>
                          )}
                          {rem === 0 && signUps.length > 0 && (
                            <div className="text-green-700 dark:text-green-400 mt-0.5">
                              Covered
                            </div>
                          )}
                        </div>
                      ) : (
                        <span>{signUps.length ? `${signUps.length} signed up` : "—"}</span>
                      )}
                    </td>
                    <td className={`${cellBorder} px-2 py-1.5`}>
                      <button
                        type="button"
                        onClick={() =>
                          mySu ? removeMySignUp(index) : addMySignUp(index)
                        }
                        disabled={
                          (!authUser && !guestDisplayName) ||
                          (!mySu && !canSignUpMore)
                        }
                        className="w-full rounded border border-transparent bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        {mySu ? "Cancel sign-up" : "Sign up to bring"}
                      </button>
                    </td>
                    <td className={`${cellBorder} px-2 py-2 text-gray-600 dark:text-gray-400`}>
                      {signUps.length === 0 ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <ul className="text-xs space-y-2">
                          {signUps.map((su) => {
                            const mine = isMineSignUp(
                              su,
                              authUser,
                              guestDisplayName,
                            );
                            return (
                              <li
                                key={su.id}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <span
                                  className={
                                    mine
                                      ? "font-medium text-blue-800 dark:text-blue-300"
                                      : ""
                                  }
                                >
                                  {su.displayName}
                                  {mine ? " (you)" : ""}
                                </span>
                                <span className="text-gray-500">·</span>
                                {mine ? (
                                  <input
                                    type="number"
                                    min={1}
                                    max={total ?? undefined}
                                    value={su.quantity ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value.trim();
                                      if (v === "") {
                                        updateSignUpQuantity({
                                          itemIndex: index,
                                          signUpId: su.id,
                                          quantity: null,
                                        });
                                        return;
                                      }
                                      const n = parseInt(v, 10);
                                      if (!Number.isFinite(n)) return;
                                      updateSignUpQuantity({
                                        itemIndex: index,
                                        signUpId: su.id,
                                        quantity: n,
                                      });
                                    }}
                                    className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-1 py-0.5 text-center"
                                    aria-label="How many you bring"
                                  />
                                ) : (
                                  <span>{su.quantity ?? "—"}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
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
                  {mySu && !authUser && (
                    <tr className="bg-gray-50 dark:bg-gray-900/60">
                      <td
                        colSpan={7}
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
                              emailDrafts[`${item.id}:${mySu.id}`] ??
                              mySu.email ??
                              ""
                            }
                            onChange={(e) =>
                              setEmailDrafts((d) => ({
                                ...d,
                                [`${item.id}:${mySu.id}`]: e.target.value,
                              }))
                            }
                            className="min-w-[12rem] flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-950"
                          />
                          <button
                            type="button"
                            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => {
                              const raw =
                                emailDrafts[`${item.id}:${mySu.id}`] ??
                                mySu.email ??
                                "";
                              const trimmed = raw.trim();
                              setSignUpEmail({
                                itemIndex: index,
                                signUpId: mySu.id,
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

/** Snapshot LiveList sign-ups for sum math inside mutations (best-effort). */
function snapshotSignUps(signUps: unknown): StorageSignUp[] {
  const xs = signUps as {
    length: number;
    get: (i: number) => { get: (k: string) => unknown } | undefined;
  };
  const out: StorageSignUp[] = [];
  for (let i = 0; i < xs.length; i++) {
    const s = xs.get(i);
    if (!s) continue;
    const g = s as { get: (k: string) => unknown };
    out.push({
      id: String(g.get("id")),
      quantity: (g.get("quantity") as number | null) ?? null,
      displayName: String(g.get("displayName") ?? ""),
      email: (g.get("email") as string | null) ?? null,
      userId: (g.get("userId") as string | null) ?? null,
    });
  }
  return out;
}

export function buildInitialStorage(items: PackingItemPayload[]): {
  items: LiveList<LiveObject<PackingItemStorage>>;
} {
  return {
    items: new LiveList(
      items.map(
        (i) =>
          new LiveObject({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            packed: i.packed,
            signUps: new LiveList(
              (i.signUps ?? []).map((s) =>
                new LiveObject({
                  id: s.id,
                  quantity: s.quantity,
                  displayName: s.displayName,
                  email: s.email,
                  userId: s.userId,
                }),
              ),
            ),
          }),
      ),
    ),
  } as { items: LiveList<LiveObject<PackingItemStorage>> };
}
