import type { Dispatch, SetStateAction } from "react";

export type AuthUser = { dbUserId: string; name: string; email: string };

export type PackingSignupMemberOption = {
  userId: string;
  name: string;
};

export type StorageSignUp = {
  id: string;
  quantity: number | null;
  displayName: string;
  email: string | null;
  userId: string | null;
  packed: boolean;
};

export type StorageRow = {
  id: string;
  sectionId?: string | null;
  /** @deprecated Migrated to sectionId */
  section?: string | null;
  name: string;
  quantity: number | null;
  quantityMax?: number | null;
  signUps?: readonly StorageSignUp[] | null;
  claimedByName?: string | null;
  claimedByEmail?: string | null;
  claimedByUserId?: string | null;
  claimedQuantity?: number | null;
};

export type ItemMeta = { id: string; sectionId: string | null };

export type ParsedKeyOrder = {
  sectionIds: string[];
  placements: Array<{ itemId: string; sectionId: string | null }>;
};

export type NeedsGroup = {
  sectionId: string | null;
  label: string;
  rows: Array<{ item: StorageRow; index: number }>;
};

export type PackingSortableItemRowProps = {
  sortId: string;
  dragDisabled: boolean;
  colCount: number;
  item: StorageRow;
  index: number;
  authUser: AuthUser | null;
  guestDisplayName: string | null;
  canManageTemplate: boolean;
  editingNeededIndex: number | null;
  setEditingNeededIndex: (n: number | null) => void;
  emailDrafts: Record<string, string>;
  setEmailDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  updateName: (a: { index: number; name: string }) => void;
  updateQuantity: (a: { index: number; quantity: number | null }) => void;
  updateQuantityMax: (a: { index: number; quantityMax: number | null }) => void;
  setItemOptionalMode: (a: { index: number; optional: boolean }) => void;
  addMySignUp: (a: { index: number; quantity?: number }) => void;
  addMemberSignUp: (a: {
    index: number;
    forUserId: string;
    quantity?: number;
  }) => void;
  removeSignUpIfAllowed: (a: { itemIndex: number; signUpId: string }) => void;
  signupMembers: readonly PackingSignupMemberOption[];
  updateSignUpQuantity: (a: {
    itemIndex: number;
    signUpId: string;
    quantity: number | null;
  }) => void;
  setSignUpEmail: (a: {
    itemIndex: number;
    signUpId: string;
    email: string | null;
  }) => void;
  setPendingRemoveIndex: (n: number | null) => void;
};
