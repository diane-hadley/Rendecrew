"use client";

import Link from "next/link";

export function PackingCollabListLink({
  href,
  isAccessibleByNonUsers,
  className,
}: {
  href: string;
  isAccessibleByNonUsers: boolean;
  className?: string;
}) {
  if (!isAccessibleByNonUsers) return null;

  return (
    <Link
      href={href}
      className={
        className ??
        "text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      }
      target="_blank"
      rel="noreferrer"
    >
      Open collaborative packing list
    </Link>
  );
}
