/**
 * Preview-era platform onboarding (FR-9): when `RENDECREW_PREVIEW_OPERATOR_CLERK_IDS`
 * is set (comma-separated Clerk user ids), only those operators may use in-app flows
 * that create new platform users. Event member add-by-existing-user is unaffected.
 * When unset, no extra restriction is applied here.
 */
export function isPreviewPlatformOperator(clerkUserId: string): boolean {
  const raw = process.env.RENDECREW_PREVIEW_OPERATOR_CLERK_IDS?.trim();
  if (!raw) return true;
  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(clerkUserId);
}
