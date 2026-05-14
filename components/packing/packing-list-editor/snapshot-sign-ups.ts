import type { StorageSignUp } from "./types";

/** Snapshot LiveList sign-ups for sum math inside mutations (best-effort). */
export function snapshotSignUps(signUps: unknown): StorageSignUp[] {
  const xs = signUps as {
    length: number;
    get: (i: number) => { get: (k: string) => unknown } | undefined;
  };
  const out: StorageSignUp[] = [];
  for (let i = 0; i < xs.length; i++) {
    const s = xs.get(i);
    if (!s) continue;
    const g = s as { get: (k: string) => unknown };
    out.push({
      id: String(g.get("id")),
      quantity: (g.get("quantity") as number | null) ?? null,
      displayName: String(g.get("displayName") ?? ""),
      email: (g.get("email") as string | null) ?? null,
      userId: (g.get("userId") as string | null) ?? null,
      packed: Boolean(g.get("packed")),
    });
  }
  return out;
}
