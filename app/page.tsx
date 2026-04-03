import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="mb-8 text-center text-4xl font-bold">🎉 Rendecrew</h1>
        <p className="mb-8 text-center text-xl">
          A collaborative trip/event planner with an embedded AI coordinator
        </p>

        <div className="flex flex-col items-center gap-4">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700">
                Sign In to Get Started
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <div className="flex items-center gap-4">
              <UserButton afterSignOutUrl="/" />
              <Link
                href="/dashboard"
                className="rounded-lg bg-green-600 px-6 py-3 text-white transition-colors hover:bg-green-700"
              >
                Go to Dashboard
              </Link>
            </div>
          </SignedIn>
        </div>
      </div>
    </main>
  );
}
