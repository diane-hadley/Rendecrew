import { LiveList, LiveObject } from "@liveblocks/client";
import type {
  PackingItemPayload,
  PackingSectionPayload,
} from "@/lib/packing-list";
import type {
  PackingItemStorage,
  PackingSectionStorage,
} from "@/liveblocks.config";

export function buildInitialStorage({
  sections,
  items,
}: {
  sections: PackingSectionPayload[];
  items: PackingItemPayload[];
}): {
  sections: LiveList<LiveObject<PackingSectionStorage>>;
  items: LiveList<LiveObject<PackingItemStorage>>;
} {
  return {
    sections: new LiveList(
      sections.map(
        (s) =>
          new LiveObject({
            id: s.id,
            title: s.title,
          }),
      ),
    ),
    items: new LiveList(
      items.map(
        (i) =>
          new LiveObject({
            id: i.id,
            sectionId: i.sectionId,
            name: i.name,
            quantity: i.quantity,
            quantityMax: i.quantityMax ?? null,
            signUps: new LiveList(
              (i.signUps ?? []).map(
                (s) =>
                  new LiveObject({
                    id: s.id,
                    quantity: s.quantity,
                    displayName: s.displayName,
                    email: s.email,
                    userId: s.userId,
                    packed: s.packed,
                  }),
              ),
            ),
          }),
      ),
    ),
  } as {
    sections: LiveList<LiveObject<PackingSectionStorage>>;
    items: LiveList<LiveObject<PackingItemStorage>>;
  };
}
