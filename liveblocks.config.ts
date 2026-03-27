import type { LiveList, LiveObject } from "@liveblocks/client";

export type PackingItemStorage = {
  id: string;
  name: string;
  quantity: number | null;
  packed: boolean;
  claimedByName: string | null;
  claimedByEmail: string | null;
  claimedByUserId: string | null;
};

declare global {
  interface Liveblocks {
    Presence: {
      guestDisplayName?: string;
    };
    Storage: {
      items: LiveList<LiveObject<PackingItemStorage>>;
    };
    UserMeta: {
      id: string;
      info: {
        name: string;
      };
    };
    RoomEvent: {};
    ThreadMetadata: {};
    RoomInfo: {};
    GroupInfo: {};
    ActivitiesData: {};
  }
}

export {};
