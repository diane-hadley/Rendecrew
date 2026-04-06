import { prisma } from "./prisma";
import { currentUser } from "@clerk/nextjs/server";
import { backfillPackingItemSignUpsForUser } from "@/lib/packing-list";

/** Clerk-signed-in DB user, or null (guest / not signed in). */
export async function getOptionalDbUser(): Promise<{
  id: string;
  name: string;
  email: string;
} | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;
  try {
    const u = await getOrCreateUser();
    return { id: u.id, name: u.name, email: u.email };
  } catch {
    return null;
  }
}

/**
 * Get or create a user in the database based on Clerk authentication
 * This function should be called in server components or server actions
 * to ensure the user exists in the database
 */
export async function getOrCreateUser() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new Error("User not authenticated");
  }

  // Get user's email (Clerk provides primaryEmailAddress)
  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error("User email not found");
  }

  const name =
    clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : clerkUser.firstName || clerkUser.lastName || email;

  // Upsert: create with Clerk-derived name; updates only sync email so `name` stays the DB display value.
  const user = await prisma.user.upsert({
    where: {
      clerkId: clerkUser.id,
    },
    update: {
      email,
    },
    create: {
      clerkId: clerkUser.id,
      email,
      name,
    },
  });

  await backfillPackingItemSignUpsForUser(user.id, email);

  return user;
}
