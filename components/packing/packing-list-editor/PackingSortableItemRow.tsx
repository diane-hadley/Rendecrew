"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  allocatedSum,
  findMySignUp,
  isMineSignUp,
  readSignUps,
  remainingUntilCap,
  remainingUntilMin,
} from "./storage-helpers";
import { isOptionalPackingMin, itemQuantityCap } from "@/lib/packing-quantity";
import type { PackingSortableItemRowProps } from "./types";
import { PackingItemSignUpModal } from "./PackingItemSignUpModal";
import { TrashIcon } from "./TrashIcon";

export function PackingSortableItemRow(props: PackingSortableItemRowProps) {
  const {
    sortId,
    dragDisabled,
    colCount,
    item,
    index,
    authUser,
    guestDisplayName,
    canManageTemplate,
    editingNeededIndex,
    setEditingNeededIndex,
    emailDrafts,
    setEmailDrafts,
    updateName,
    updateQuantity,
    updateQuantityMax,
    setItemOptionalMode,
    addMySignUp,
    addMemberSignUp,
    removeSignUpIfAllowed,
    signupMembers,
    updateSignUpQuantity,
    setSignUpEmail,
    setPendingRemoveIndex,
  } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId, disabled: dragDisabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  };

  const signUps = readSignUps(item);
  const qMin = item.quantity;
  const qMax =
    item.quantityMax != null && qMin != null && item.quantityMax >= qMin
      ? item.quantityMax
      : null;
  const cap = itemQuantityCap(qMin, qMax);
  const isOptionalItem = isOptionalPackingMin(qMin);
  const isRange = qMin != null && qMin > 0 && qMax != null && qMax > qMin;
  const sum = allocatedSum(signUps);
  const remCap = remainingUntilCap(cap, signUps);
  const remMin = remainingUntilMin(qMin, signUps);
  const mySu = findMySignUp(signUps, authUser, guestDisplayName);
  const canSignUpMore =
    authUser || guestDisplayName
      ? cap == null || (remCap != null && remCap >= 1)
      : false;

  const otherMembersEligible = useMemo(() => {
    if (!authUser || signupMembers.length === 0) return [];
    return signupMembers.filter(
      (m) =>
        m.userId !== authUser.dbUserId &&
        !signUps.some((s) => s.userId === m.userId),
    );
  }, [authUser, signupMembers, signUps]);

  const [signUpModalOpen, setSignUpModalOpen] = useState(false);
  const [signUpModalMember, setSignUpModalMember] = useState("");
  const [signUpModalQty, setSignUpModalQty] = useState("1");

  useEffect(() => {
    if (!signUpModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSignUpModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signUpModalOpen]);

  const showSignUpModalButton =
    canSignUpMore &&
    Boolean(authUser || guestDisplayName) &&
    (!mySu || otherMembersEligible.length > 0);

  const showMemberSelect = Boolean(
    authUser &&
    signupMembers.length > 0 &&
    (!mySu || otherMembersEligible.length > 0),
  );

  const parsedSignUpQty = parseInt(signUpModalQty.trim(), 10);
  const qtyOk =
    Number.isFinite(parsedSignUpQty) &&
    parsedSignUpQty >= 1 &&
    (remCap == null || parsedSignUpQty <= remCap);

  let signUpConfirmDisabled = !qtyOk || !canSignUpMore;
  if (authUser && showMemberSelect && mySu) {
    signUpConfirmDisabled = signUpConfirmDisabled || !signUpModalMember;
  }

  const openSignUpModal = () => {
    setSignUpModalMember(mySu ? "" : authUser ? "__me__" : "");
    setSignUpModalQty("1");
    setSignUpModalOpen(true);
  };

  const confirmSignUpModal = () => {
    if (!qtyOk || !canSignUpMore) return;
    const q = parsedSignUpQty;
    if (!authUser) {
      addMySignUp({ index, quantity: q });
    } else if (mySu) {
      if (!signUpModalMember) return;
      addMemberSignUp({
        index,
        forUserId: signUpModalMember,
        quantity: q,
      });
    } else if (!showMemberSelect || signUpModalMember === "__me__") {
      addMySignUp({ index, quantity: q });
    } else {
      addMemberSignUp({
        index,
        forUserId: signUpModalMember,
        quantity: q,
      });
    }
    setSignUpModalOpen(false);
  };

  const signUpModalTitleId = `packing-signup-modal-${item.id}`;

  const cellBorder = "border border-gray-300 dark:border-gray-600 align-middle";

  const showDrag = colCount >= 7;

  return (
    <Fragment>
      <tr
        ref={setNodeRef}
        style={style}
        className="bg-white hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900/80"
      >
        {showDrag ? (
          <td className={`${cellBorder} w-10 p-0 text-center`}>
            {!dragDisabled ? (
              <button
                type="button"
                className="mx-auto flex cursor-grab touch-none items-center justify-center rounded border border-transparent px-1 py-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
                aria-label="Drag to reorder item"
                {...attributes}
                {...listeners}
              >
                ⣿
              </button>
            ) : (
              <span className="inline-block px-1 py-2 text-gray-300 dark:text-gray-600">
                —
              </span>
            )}
          </td>
        ) : null}
        <td className={`${cellBorder} p-0`}>
          <input
            type="text"
            readOnly={!canManageTemplate}
            value={item.name}
            onChange={(e) => updateName({ index, name: e.target.value })}
            className={`w-full min-w-32 border-0 p-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:text-gray-100 dark:focus:ring-blue-400 ${
              canManageTemplate
                ? "bg-transparent"
                : "cursor-default bg-gray-50/80 dark:bg-gray-900/50"
            }`}
            aria-label="Item name"
          />
        </td>
        <td className={`${cellBorder} p-0 text-center`}>
          {canManageTemplate && editingNeededIndex === index ? (
            <div
              className="flex flex-col gap-1.5 p-1"
              onBlur={(e) => {
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                setEditingNeededIndex(null);
              }}
            >
              <label className="flex cursor-pointer items-center gap-2 px-0.5 text-left text-[0.7rem] text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={isOptionalItem}
                  onChange={(e) =>
                    setItemOptionalMode({
                      index,
                      optional: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span>Optional (no minimum)</span>
              </label>
              {isOptionalItem ? (
                <input
                  type="number"
                  min={1}
                  placeholder="Up to (if brought)"
                  autoFocus
                  value={
                    item.quantityMax != null && item.quantityMax > 0
                      ? item.quantityMax
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    updateQuantityMax({
                      index,
                      quantityMax:
                        v === "" ? null : Math.max(1, parseInt(v, 10) || 0),
                    });
                  }}
                  className="w-full min-w-0 rounded border border-gray-300 bg-white p-1 text-center text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-400"
                  aria-label="Maximum to bring if optional item is covered"
                />
              ) : (
                <>
                  <input
                    type="number"
                    min={0}
                    placeholder="Min"
                    autoFocus
                    value={item.quantity ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateQuantity({
                        index,
                        quantity:
                          v === "" ? null : Math.max(0, parseInt(v, 10) || 0),
                      });
                    }}
                    className="w-full min-w-0 rounded border border-gray-300 bg-white p-1 text-center text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-400"
                    aria-label="Minimum quantity needed"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Max (optional range)"
                    disabled={item.quantity == null}
                    value={
                      item.quantity == null ? "" : (item.quantityMax ?? "")
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      updateQuantityMax({
                        index,
                        quantityMax:
                          v === "" ? null : Math.max(0, parseInt(v, 10) || 0),
                      });
                    }}
                    className="w-full min-w-0 rounded border border-gray-300 bg-white p-1 text-center text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-400"
                    aria-label="Maximum quantity (optional range above min)"
                  />
                </>
              )}
            </div>
          ) : canManageTemplate ? (
            <button
              type="button"
              onClick={() => setEditingNeededIndex(index)}
              className="min-h-11 w-full p-2 text-center text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900/80"
              aria-label={
                qMin == null
                  ? "Needed: not set, click to edit"
                  : isOptionalItem
                    ? qMax != null
                      ? `Needed: optional, up to ${qMax}, click to edit`
                      : "Needed: optional, click to edit"
                    : isRange
                      ? `Needed: ${qMin} to ${qMax}, click to edit`
                      : `Needed: ${qMin}, click to edit`
              }
            >
              {qMin == null ? (
                "—"
              ) : isOptionalItem ? (
                <span className="flex flex-col items-center gap-0.5 leading-tight">
                  <span>Optional</span>
                  {qMax != null ? (
                    <span className="text-[0.65rem] font-normal text-gray-500 dark:text-gray-400">
                      up to {qMax}
                    </span>
                  ) : null}
                </span>
              ) : isRange ? (
                `${qMin} – ${qMax}`
              ) : (
                qMin
              )}
            </button>
          ) : (
            <div className="min-h-11 w-full p-2 text-center text-sm text-gray-900 dark:text-gray-100">
              {qMin == null ? (
                "—"
              ) : isOptionalItem ? (
                <span className="flex flex-col items-center gap-0.5 leading-tight">
                  <span>Optional</span>
                  {qMax != null ? (
                    <span className="text-[0.65rem] font-normal text-gray-500 dark:text-gray-400">
                      up to {qMax}
                    </span>
                  ) : null}
                </span>
              ) : isRange ? (
                `${qMin} – ${qMax}`
              ) : (
                qMin
              )}
            </div>
          )}
        </td>
        <td
          className={`${cellBorder} p-2 text-center text-xs text-gray-600 dark:text-gray-400`}
        >
          {qMin != null ? (
            <div>
              <div>
                {isOptionalItem ? (
                  qMax != null ? (
                    <>
                      {sum} / {qMax}
                    </>
                  ) : (
                    sum
                  )
                ) : isRange ? (
                  <>
                    {sum} / {qMin} – {qMax}
                  </>
                ) : (
                  sum
                )}
              </div>
              {isOptionalItem ? (
                <>
                  {qMax != null && remCap != null && remCap > 0 && (
                    <div className="mt-0.5 text-sky-700 dark:text-sky-400">
                      {remCap} more welcome
                    </div>
                  )}
                  {qMax != null && remCap === 0 && signUps.length > 0 && (
                    <div className="mt-0.5 text-green-700 dark:text-green-400">
                      Covered
                    </div>
                  )}
                </>
              ) : isRange ? (
                <>
                  {remMin != null && remMin > 0 && (
                    <div className="mt-0.5 text-amber-700 dark:text-amber-400">
                      {remMin} to minimum
                    </div>
                  )}
                  {remMin === 0 && remCap != null && remCap > 0 && (
                    <div className="mt-0.5 text-sky-700 dark:text-sky-400">
                      Min met · {remCap} until max
                    </div>
                  )}
                  {remCap === 0 && signUps.length > 0 && (
                    <div className="mt-0.5 text-green-700 dark:text-green-400">
                      At max
                    </div>
                  )}
                </>
              ) : (
                <>
                  {remCap != null && remCap > 0 && (
                    <div className="mt-0.5 text-amber-700 dark:text-amber-400">
                      {remCap} left
                    </div>
                  )}
                  {remCap === 0 && signUps.length > 0 && (
                    <div className="mt-0.5 text-green-700 dark:text-green-400">
                      Covered
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <span>{signUps.length ? `${signUps.length} signed up` : "—"}</span>
          )}
        </td>
        <td className={`${cellBorder} px-2 py-1.5 text-center`}>
          {showSignUpModalButton ? (
            <button
              type="button"
              onClick={openSignUpModal}
              className="w-full whitespace-nowrap rounded border border-transparent bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Sign up to bring
            </button>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>
        <td className={`${cellBorder} p-2 text-gray-600 dark:text-gray-400`}>
          {signUps.length === 0 ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            <ul className="space-y-2 text-xs">
              {signUps.map((su) => {
                const mine = isMineSignUp(su, authUser, guestDisplayName);
                const linkedMember =
                  authUser &&
                  su.userId &&
                  signupMembers.some((m) => m.userId === su.userId);
                const showRemoveOtherMemberSignUp =
                  linkedMember &&
                  su.userId &&
                  authUser &&
                  su.userId !== authUser.dbUserId;
                const showRemoveSignUp = mine || showRemoveOtherMemberSignUp;
                const canEditQuantity =
                  mine ||
                  (Boolean(authUser) &&
                    Boolean(su.userId) &&
                    signupMembers.some((m) => m.userId === su.userId));
                return (
                  <li
                    key={su.id}
                    className="grid grid-cols-[minmax(0,1fr)_4rem_1.5rem] items-center gap-x-1"
                  >
                    <span
                      className={`min-w-0 truncate ${
                        mine
                          ? "font-medium text-blue-800 dark:text-blue-300"
                          : ""
                      }`}
                      title={`${su.displayName}${mine ? " (you)" : ""}`.trim()}
                    >
                      {su.displayName}
                      {mine ? " (you)" : ""}
                    </span>
                    <div className="flex justify-end tabular-nums">
                      {canEditQuantity ? (
                        <input
                          type="number"
                          min={1}
                          max={cap ?? undefined}
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
                          className="w-full max-w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-center dark:border-gray-600 dark:bg-gray-950"
                          aria-label={
                            mine ? "How many you bring" : "How many they bring"
                          }
                        />
                      ) : (
                        <span className="block w-full max-w-16 text-right">
                          {su.quantity ?? "—"}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end">
                      {showRemoveSignUp ? (
                        <button
                          type="button"
                          className="shrink-0 text-sm font-semibold leading-none text-red-600 hover:underline dark:text-red-400"
                          aria-label="Remove"
                          onClick={() =>
                            removeSignUpIfAllowed({
                              itemIndex: index,
                              signUpId: su.id,
                            })
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </td>
        <td className={`${cellBorder} px-2 py-1.5 text-center`}>
          {canManageTemplate ? (
            <button
              type="button"
              onClick={() => setPendingRemoveIndex(index)}
              className="inline-flex items-center justify-center text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              aria-label="Remove item"
              title="Remove item"
            >
              <TrashIcon className="size-4" />
            </button>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>
      </tr>
      {mySu && !authUser && (
        <tr className="bg-gray-50 dark:bg-gray-900/60">
          <td
            colSpan={colCount}
            className="border border-gray-300 px-3 py-2 dark:border-gray-600"
          >
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Add your email (optional) so we can link this to your Rendecrew
              account if you sign up later.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                placeholder="you@example.com"
                value={emailDrafts[`${item.id}:${mySu.id}`] ?? mySu.email ?? ""}
                onChange={(e) =>
                  setEmailDrafts((d) => ({
                    ...d,
                    [`${item.id}:${mySu.id}`]: e.target.value,
                  }))
                }
                className="min-w-48 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-950"
              />
              <button
                type="button"
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                onClick={() => {
                  const raw =
                    emailDrafts[`${item.id}:${mySu.id}`] ?? mySu.email ?? "";
                  const trimmed = raw.trim();
                  setSignUpEmail({
                    itemIndex: index,
                    signUpId: mySu.id,
                    email: trimmed === "" ? null : trimmed.toLowerCase(),
                  });
                }}
              >
                Save email
              </button>
            </div>
          </td>
        </tr>
      )}
      {signUpModalOpen ? (
        <PackingItemSignUpModal
          titleId={signUpModalTitleId}
          itemName={item.name}
          onClose={() => setSignUpModalOpen(false)}
          isGuest={!authUser}
          showMemberSelect={showMemberSelect}
          mySu={Boolean(mySu)}
          memberValue={signUpModalMember}
          onMemberChange={setSignUpModalMember}
          quantityStr={signUpModalQty}
          onQuantityChange={setSignUpModalQty}
          otherMembers={otherMembersEligible}
          quantityMax={remCap ?? undefined}
          onConfirm={confirmSignUpModal}
          confirmDisabled={signUpConfirmDisabled}
        />
      ) : null}
    </Fragment>
  );
}
