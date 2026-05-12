"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  copySuggestionToPersonal,
  createPersonalPackingItem,
  moderatePackingSuggestion,
  suggestPackingItem,
} from "@/app/actions/packing-advanced";
import { setMyPackingSignUpPacked } from "@/app/actions/packing-list";
import type { PackingCommitmentForUser } from "@/lib/packing-list";
import type { PersonalItemVM } from "@/lib/personal-packing-sections";
import { PersonalPackingDnDList } from "./PersonalPackingDnDList";

export type { PersonalItemVM } from "@/lib/personal-packing-sections";
export { buildPersonalItemSectionGroups } from "@/lib/personal-packing-sections";

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
          : "Suggestions of personal items to pack appear in the catalog for everyone to browse."}
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
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Suggest an item
          </h3>
          <div className="mt-2 rounded-lg border border-gray-300 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-950">
            <form
              className="flex flex-wrap items-end gap-2"
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
              <div className="min-w-56 flex-1">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                  Item
                </label>
                <input
                  required
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Suggest item"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </div>
              <div className="w-40">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                  Section
                </label>
                <input
                  maxLength={120}
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="Section"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                  Qty
                </label>
                <input
                  type="number"
                  min={1}
                  value={defQty}
                  onChange={(e) => setDefQty(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Suggest
              </button>
            </form>
          </div>
        </section>
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
  sharedSectionTitles = [],
}: {
  eventId: string;
  isSignedIn: boolean;
  commitments: PackingCommitmentForUser[];
  personalItems: PersonalItemVM[];
  /** Shared list section titles in display order (for grouping personal rows). */
  sharedSectionTitles?: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newQty, setNewQty] = useState("1");

  const sectionOptions = (() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (raw: string | null | undefined) => {
      const t = raw?.trim() ?? "";
      if (t === "" || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    for (const it of personalItems) add(it.section);
    out.sort((a, b) => a.localeCompare(b));
    return out;
  })();

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
                className="flex flex-wrap items-center gap-2 rounded border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.signUpPacked}
                    disabled={pending}
                    onChange={(e) => {
                      const next = e.target.checked;
                      startTransition(async () => {
                        setError(null);
                        const r = await setMyPackingSignUpPacked(
                          eventId,
                          c.signUpId,
                          next,
                        );
                        if (!r.ok) setError(r.error);
                        else router.refresh();
                      });
                    }}
                    aria-label={`Packed: ${c.itemName}`}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {c.itemName}
                  </span>
                </label>
                <span className="text-gray-500">
                  · {c.signUpQuantity ?? "—"}
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
        <div className="mt-2 rounded-lg border border-gray-300 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-950">
          <form
            className="flex flex-wrap items-end gap-2"
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
            <div className="min-w-56 flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Item
              </label>
              <input
                required
                maxLength={200}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Add personal item"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Section
              </label>
              <input
                maxLength={120}
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                placeholder="Section"
                list="personal-packing-section-options"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
            <datalist id="personal-packing-section-options">
              {sectionOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="w-28">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Qty
              </label>
              <input
                type="number"
                min={1}
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500"
            >
              Add
            </button>
          </form>
        </div>

        <PersonalPackingDnDList
          eventId={eventId}
          personalItems={personalItems}
          sharedSectionTitles={sharedSectionTitles}
          onServerError={(message) => setError(message)}
        />
      </section>
    </div>
  );
}
