import { prisma } from "./prisma";
import { currentUser } from "@clerk/nextjs/server";
import { APP_DEFAULT_TIME_ZONE } from "@/lib/event-datetime";
import { backfillPackingItemSignUpsForUser } from "@/lib/packing-list";
import { isPreviewPlatformOperator } from "@/lib/preview-platform";

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

  const existing = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    select: { id: true },
  });
  if (!existing && !isPreviewPlatformOperator(clerkUser.id)) {
    throw new Error(
      "New accounts are limited during preview. Ask your Rendecrew preview operator for access.",
    );
  }

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
      timezone: APP_DEFAULT_TIME_ZONE,
    },
  });

  await backfillPackingItemSignUpsForUser(user.id, email);

  return user;
}
