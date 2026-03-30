import type { LiveList, LiveObject } from "@liveblocks/client";

export type PackingSignUpStorage = {
  id: string;
  quantity: number | null;
  displayName: string;
  email: string | null;
  userId: string | null;
  /** Synced for storage; personal edits merge in persist from DB. */
  packed: boolean;
};

export type PackingItemStorage = {
  id: string;
  /** Optional section header grouping; omit or null for uncategorized rows. */
  section?: string | null;
  name: string;
  quantity: number | null;
  /** Upper bound inclusive; omit or null = exact count of `quantity`. */
  quantityMax?: number | null;
  signUps: LiveList<LiveObject<PackingSignUpStorage>>;
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
