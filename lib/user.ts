import { prisma } from './prisma'
import { currentUser } from '@clerk/nextjs/server'
import { backfillPackingItemClaimsForUser } from '@/lib/packing-list'

/**
 * Get or create a user in the database based on Clerk authentication
 * This function should be called in server components or server actions
 * to ensure the user exists in the database
 */
export async function getOrCreateUser() {
  const clerkUser = await currentUser()
  
  if (!clerkUser) {
    throw new Error('User not authenticated')
  }

  // Get user's email (Clerk provides primaryEmailAddress)
  const email = clerkUser.emailAddresses[0]?.emailAddress
  if (!email) {
    throw new Error('User email not found')
  }

  const name =
    clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : clerkUser.firstName || clerkUser.lastName || email

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
  })

  await backfillPackingItemClaimsForUser(user.id, email)

  return user
}

/**
 * Get user by Clerk ID
 */
export async function getUserByClerkId(clerkId: string) {
  return prisma.user.findUnique({
    where: {
      clerkId,
    },
  })
}

/**
 * Get current authenticated user from database
 */
export async function getCurrentUser() {
  const clerkUser = await currentUser()
  
  if (!clerkUser) {
    return null
  }

  return getUserByClerkId(clerkUser.id)
}