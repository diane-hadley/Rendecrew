"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  copySuggestionToPersonal,
  createPersonalPackingItem,
  deletePersonalPackingItem,
  moderatePackingSuggestion,
  suggestPackingItem,
  updatePersonalPackingItem,
} from "@/app/actions/packing-advanced";
import type { PackingCommitmentForUser } from "@/lib/packing-list";

export type PublishedSuggestionVM = {
  id: string;
  name: string;
  section: string | null;
  defaultQuantity: number | null;
  createdAt: string;
  isNew: boolean;
  alreadyCopied: boolean;
};

export type DraftSuggestionVM = {
  id: string;
  name: string;
  section: string | null;
  defaultQuantity: number | null;
  createdByName: string;
};

export type PersonalItemVM = {
  id: string;
  name: string;
  section: string | null;
  quantity: number;
  packed: boolean;
};

export type PackingMainTab = "shared" | "suggestions" | "my";

export function PackingTabBar({
  active,
  onChange,
}: {
  active: PackingMainTab;
  onChange: (t: PackingMainTab) => void;
}) {
  const tabBtn = (key: PackingMainTab, label: string) => {
    const selected = active === key;
    const id = `packing-main-tab:${key}`;
    const panelId = `packing-main-panel:${key}`;
    return (
      <button
        key={key}
        id={id}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={panelId}
        tabIndex={selected ? 0 : -1}
        onClick={() => onChange(key)}
        className={
          selected
            ? "relative z-10 -mb-px rounded-t-md border border-gray-200 border-b-white bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm dark:border-gray-700 dark:border-b-gray-900 dark:bg-gray-900 dark:text-gray-100"
            : "rounded-t-md bg-gray-200/70 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-gray-50"
        }
      >
        {label}
      </button>
    );
  };
  return (
    <div
      role="tablist"
      aria-label="Packing views"
      className="flex items-end gap-1 border-b border-gray-200 bg-gray-200/70 px-2 pt-2 dark:border-gray-700 dark:bg-gray-800/70"
    >
      {tabBtn("shared", "Shared list")}
      {tabBtn("suggestions", "Suggestions")}
      {tabBtn("my", "My packing")}
    </div>
  );
}

export function PackingSuggestionsTab({
  eventId,
  isSignedIn,
  canManageTemplate,
  suggestionApprovalRequired,
  published,
  drafts,
}: {
  eventId: string;
  isSignedIn: boolean;
  canManageTemplate: boolean;
  suggestionApprovalRequired: boolean;
  published: PublishedSuggestionVM[];
  drafts: DraftSuggestionVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [defQty, setDefQty] = useState("");

  return (
    <div className="space-y-6 pt-4 text-sm">
      {error && (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <p className="text-gray-600 dark:text-gray-400">
        {suggestionApprovalRequired
          ? "New ideas from participants may need admin approval before everyone sees them."
          : "Suggestions from signed-in participants appear in the catalog for everyone to browse."}
      </p>

      {canManageTemplate && drafts.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <h3 className="font-semibold text-amber-950 dark:text-amber-100">
            Pending approval ({drafts.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200/80 bg-white/90 px-3 py-2 dark:border-amber-900/50 dark:bg-gray-900/80"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {d.name}
                  </span>
                  {d.section ? (
                    <span className="text-gray-500"> · {d.section}</span>
                  ) : null}
                  <div className="text-xs text-gray-500">
                    From {d.createdByName}
                    {d.defaultQuantity != null
                      ? ` · default ×${d.defaultQuantity}`
                      : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const r = await moderatePackingSuggestion(
                          d.id,
                          "publish",
                        );
                        if (!r.ok) setError(r.error);
                        else router.refresh();
                      });
                    }}
                    className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-500"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const r = await moderatePackingSuggestion(
                          d.id,
                          "reject",
                        );
                        if (!r.ok) setError(r.error);
                        else router.refresh();
                      });
                    }}
                    className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isSignedIn ? (
        <form
          className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const dq =
                defQty.trim() === ""
                  ? null
                  : Math.max(1, parseInt(defQty, 10) || 0);
              const r = await suggestPackingItem(eventId, {
                name,
                section: section.trim() || null,
                defaultQuantity: dq,
              });
              if (!r.ok) setError(r.error);
              else {
                setName("");
                setSection("");
                setDefQty("");
                router.refresh();
              }
            });
          }}
        >
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Suggest an item
          </h3>
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name"
            className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-950"
          />
          <input
            maxLength={120}
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="Section (optional)"
            className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-950"
          />
          <input
            type="number"
            min={1}
            value={defQty}
            onChange={(e) => setDefQty(e.target.value)}
            placeholder="Default quantity (optional)"
            className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-950"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500"
          >
            Submit suggestion
          </button>
        </form>
      ) : (
        <p className="text-gray-600 dark:text-gray-400">
          Sign in to suggest items for the catalog. You can still read published
          suggestions below.
        </p>
      )}

      <div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Published catalog
        </h3>
        {published.length === 0 ? (
          <p className="mt-2 text-gray-500">No suggestions yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {published.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div>
                  {p.isNew ? (
                    <span className="mr-2 rounded bg-sky-100 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                      New
                    </span>
                  ) : null}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {p.name}
                  </span>
                  {p.section ? (
                    <span className="text-gray-500"> · {p.section}</span>
                  ) : null}
                  {p.defaultQuantity != null ? (
                    <span className="text-gray-500">
                      {" "}
                      · default ×{p.defaultQuantity}
                    </span>
                  ) : null}
                </div>
                {isSignedIn ? (
                  <button
                    type="button"
                    disabled={pending || p.alreadyCopied}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const r = await copySuggestionToPersonal(p.id);
                        if (!r.ok) setError(r.error);
                        else router.refresh();
                      });
                    }}
                    className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {p.alreadyCopied ? "On your list" : "Copy to my list"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PackingMyPackingTab({
  eventId,
  isSignedIn,
  commitments,
  personalItems,
}: {
  eventId: string;
  isSignedIn: boolean;
  commitments: PackingCommitmentForUser[];
  personalItems: PersonalItemVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newQty, setNewQty] = useState("1");

  if (!isSignedIn) {
    return (
      <div className="pt-4 text-sm text-gray-600 dark:text-gray-400">
        <p>
          Sign in to maintain a personal checklist and copy items from the
          suggestion catalog. Guests can still use the shared list and sign up
          for group items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-4 text-sm">
      {error && (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <section>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Group commitments
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Items you signed up for on the shared list.
        </p>
        {commitments.length === 0 ? (
          <p className="mt-2 text-gray-500">
            No sign-ups linked to your account.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {commitments.map((c) => (
              <li
                key={c.signUpId}
                className="rounded border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                  Group
                </span>{" "}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {c.itemName}
                </span>
                <span className="text-gray-500">
                  {" "}
                  · you: {c.signUpQuantity ?? "—"} packed:{" "}
                  {c.signUpPacked ? "yes" : "no"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Personal items
        </h3>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const q = Math.max(1, parseInt(newQty, 10) || 1);
            startTransition(async () => {
              const r = await createPersonalPackingItem(eventId, {
                name: newName,
                section: newSection.trim() || null,
                quantity: q,
              });
              if (!r.ok) setError(r.error);
              else {
                setNewName("");
                setNewSection("");
                setNewQty("1");
                router.refresh();
              }
            });
          }}
        >
          <input
            required
            maxLength={200}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add personal item"
            className="min-w-48 flex-1 rounded border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-950"
          />
          <input
            maxLength={120}
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Section"
            className="w-32 rounded border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-950"
          />
          <input
            type="number"
            min={1}
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="w-20 rounded border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-950"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500"
          >
            Add
          </button>
        </form>

        {personalItems.length === 0 ? (
          <p className="mt-3 text-gray-500">No personal rows yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {personalItems.map((it) => (
              <li
                key={it.id}
                className="flex flex-wrap items-center gap-2 rounded border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={it.packed}
                    onChange={(e) => {
                      startTransition(async () => {
                        await updatePersonalPackingItem(it.id, {
                          packed: e.target.checked,
                        });
                        router.refresh();
                      });
                    }}
                  />
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    Personal
                  </span>
                </label>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {it.name}
                </span>
                {it.section ? (
                  <span className="text-gray-500">· {it.section}</span>
                ) : null}
                <input
                  type="number"
                  min={1}
                  defaultValue={it.quantity}
                  key={it.id + String(it.quantity)}
                  className="w-16 rounded border border-gray-300 px-1 py-0.5 text-center dark:border-gray-600 dark:bg-gray-950"
                  onBlur={(e) => {
                    const n = Math.max(1, parseInt(e.target.value, 10) || 1);
                    if (n === it.quantity) return;
                    startTransition(async () => {
                      await updatePersonalPackingItem(it.id, { quantity: n });
                      router.refresh();
                    });
                  }}
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  className="ml-auto text-xs text-red-600 hover:underline dark:text-red-400"
                  onClick={() => {
                    startTransition(async () => {
                      await deletePersonalPackingItem(it.id);
                      router.refresh();
                    });
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
