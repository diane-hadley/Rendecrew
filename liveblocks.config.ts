import type { LiveList, LiveObject } from "@liveblocks/client";

export type PackingSignUpStorage = {
  id: string;
  quantity: number | null;
  displayName: string;
  email: string | null;
  userId: string | null;
};

export type PackingItemStorage = {
  id: string;
  name: string;
  quantity: number | null;
  packed: boolean;
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
