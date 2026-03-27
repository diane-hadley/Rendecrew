import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackingCollabPage } from "@/components/packing/PackingCollabPage";
import {
  getPackingListByRoomId,
  type PackingItemPayload,
} from "@/lib/packing-list";
import { getOrCreateUser } from "@/lib/user";

export default async function PublicPackingPage({
  params,
}: {
  params: { roomId: string };
}) {
  const list = await getPackingListByRoomId(params.roomId);
  if (!list) {
    notFound();
  }

  const clerkUser = await currentUser();
  let authUser: { dbUserId: string; name: string; email: string } | null = null;
  if (clerkUser) {
    try {
      const dbUser = await getOrCreateUser();
      authUser = {
        dbUserId: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
      };
    } catch {
      authUser = null;
    }
  }

  const initialItems: PackingItemPayload[] = list.items.map((it) => ({
    id: it.id,
    name: it.name,
    quantity: it.quantity,
    packed: it.packed,
    claimedByName: it.claimedByName,
    claimedByEmail: it.claimedByEmail,
    claimedByUserId: it.claimedByUserId,
  }));

  return (
    <div className="min-h-screen p-6 md:p-10 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <Link
              href="/"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Rendecrew
            </Link>
            <span className="mx-2">·</span>
            Shared packing list (no account required)
          </p>
          {!clerkUser && (
            <Link
              href="/sign-in"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Sign in
            </Link>
          )}
        </div>
        <PackingCollabPage
          roomId={list.liveblocksRoomId}
          eventTitle={list.event.title}
          initialItems={initialItems}
          authUser={authUser}
        />
      </div>
    </div>
  );
}
