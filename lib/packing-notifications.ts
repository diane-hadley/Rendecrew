import type { PackingItemPayload } from "@/lib/packing-list";
import type { EnqueueNotificationInput } from "@/lib/notifications";
import { enqueueManyNotifications } from "@/lib/notifications";

type DbSignUp = {
  id: string;
  quantity: number | null;
  userId: string | null;
};

type DbItem = {
  id: string;
  name: string;
  signUps: DbSignUp[];
};

function qtyKey(q: number | null | undefined): number | null {
  return q == null ? null : q;
}

/**
 * Diff DB snapshot vs incoming persist payload; emits packing notifications (spec 0006).
 * `actorUserId` null (guest) skips actor suppression only where actor is unknown.
 */
export function buildPackingPersistNotificationQueue(params: {
  eventId: string;
  eventTitle: string;
  packingListId: string;
  dbItemsBefore: DbItem[];
  itemsAfter: PackingItemPayload[];
  actorUserId: string | null;
}): EnqueueNotificationInput[] {
  const out: EnqueueNotificationInput[] = [];
  const { eventId, eventTitle, packingListId, actorUserId } = params;
  const oldById = new Map(params.dbItemsBefore.map((i) => [i.id, i]));
  const newIds = new Set(params.itemsAfter.map((i) => i.id));

  const baseMeta = (item: { id: string; name: string }) => ({
    eventId,
    eventTitle,
    packingListId,
    packingItemId: item.id,
    packingItemName: item.name,
  });

  // Entire items removed from the list
  for (const oldItem of params.dbItemsBefore) {
    if (newIds.has(oldItem.id)) continue;
    for (const su of oldItem.signUps) {
      const uid = su.userId?.trim();
      if (!uid) continue;
      out.push({
        recipientUserId: uid,
        actorUserId,
        kind: "packing.removed_from_item",
        eventId,
        metadata: baseMeta(oldItem),
      });
    }
  }

  for (const it of params.itemsAfter) {
    const oldItem = oldById.get(it.id);
    const meta = baseMeta({ id: it.id, name: it.name.trim() });

    if (!oldItem) {
      for (const su of it.signUps) {
        const uid = su.userId?.trim();
        if (!uid) continue;
        out.push({
          recipientUserId: uid,
          actorUserId,
          kind: "packing.signup_or_quantity",
          eventId,
          metadata: { ...meta, packingSignUpId: su.id },
        });
      }
      continue;
    }

    const oldBySuId = new Map(oldItem.signUps.map((s) => [s.id, s]));

    for (const oldSu of oldItem.signUps) {
      const uid = oldSu.userId?.trim();
      if (!uid) continue;
      const still = it.signUps.find((s) => s.id === oldSu.id);
      if (!still) {
        out.push({
          recipientUserId: uid,
          actorUserId,
          kind: "packing.removed_from_item",
          eventId,
          metadata: { ...meta, packingSignUpId: oldSu.id },
        });
        continue;
      }
      const nextUid = still.userId?.trim() ?? "";
      if (!nextUid || nextUid !== uid) {
        out.push({
          recipientUserId: uid,
          actorUserId,
          kind: "packing.removed_from_item",
          eventId,
          metadata: { ...meta, packingSignUpId: oldSu.id },
        });
      }
    }

    for (const newSu of it.signUps) {
      const uid = newSu.userId?.trim();
      if (!uid) continue;
      const prev = oldBySuId.get(newSu.id);
      if (!prev?.userId?.trim()) {
        out.push({
          recipientUserId: uid,
          actorUserId,
          kind: "packing.signup_or_quantity",
          eventId,
          metadata: { ...meta, packingSignUpId: newSu.id },
        });
        continue;
      }
      const prevUid = prev.userId.trim();
      if (prevUid !== uid) {
        out.push({
          recipientUserId: uid,
          actorUserId,
          kind: "packing.signup_or_quantity",
          eventId,
          metadata: { ...meta, packingSignUpId: newSu.id },
        });
        continue;
      }
      if (qtyKey(prev.quantity) !== qtyKey(newSu.quantity)) {
        out.push({
          recipientUserId: uid,
          actorUserId,
          kind: "packing.signup_or_quantity",
          eventId,
          metadata: { ...meta, packingSignUpId: newSu.id },
        });
      }
    }
  }

  return dedupePackingQueue(out);
}

/** Same recipient/kind/item/signUp in one transaction → one row (spec 0006 section 3 bulk preference). */
function dedupePackingQueue(
  items: EnqueueNotificationInput[],
): EnqueueNotificationInput[] {
  const seen = new Set<string>();
  const res: EnqueueNotificationInput[] = [];
  for (const n of items) {
    const su = String(n.metadata?.packingSignUpId ?? "");
    const key = `${n.kind}|${n.recipientUserId}|${n.metadata?.packingItemId ?? ""}|${su}`;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(n);
  }
  return res;
}

export async function emitPackingPersistNotifications(
  params: {
    eventId: string;
    eventTitle: string;
    packingListId: string;
    dbItemsBefore: DbItem[];
    itemsAfter: PackingItemPayload[];
    actorUserId: string | null;
    /** Pass when known (see `persistPackingListItems`); stored in metadata for copy. */
    actorName: string | null;
  },
  /** When the caller already built the queue (e.g. to skip work when empty), pass it to avoid building twice. */
  prebuiltQueue?: EnqueueNotificationInput[],
): Promise<void> {
  const { actorName } = params;
  const baseQueue =
    prebuiltQueue ?? buildPackingPersistNotificationQueue(params);
  const queue = baseQueue.map((n) => ({
    ...n,
    metadata: {
      ...n.metadata,
      ...(actorName != null && actorName !== "" ? { actorName } : {}),
    },
  }));
  if (!queue.length) return;
  await enqueueManyNotifications(queue);
}
