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

export type PackingSectionStorage = {
  id: string;
  title: string;
};

export type PackingItemStorage = {
  id: string;
  /** Uncategorized when null. Legacy `section` string is migrated to sections + sectionId. */
  sectionId: string | null;
  /** @deprecated Migrated to `sectionId`; cleared after one-time migration. */
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
      sections: LiveList<LiveObject<PackingSectionStorage>>;
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
