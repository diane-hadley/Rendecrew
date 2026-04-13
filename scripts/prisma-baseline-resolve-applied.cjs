/**
 * One-time: mark all existing migrations as "already applied" without running SQL.
 * Use when your Postgres database already matches the migration chain (e.g. schema
 * was created with `db push` earlier) and `migrate dev` fails with P3005.
 *
 * After this, use `npx prisma migrate dev` for new migrations, or `migrate deploy` in CI.
 *
 * Do NOT run if your database is missing changes from any migration below — in that
 * case run the SQL manually or fix drift first (`prisma migrate diff`).
 *
 * Uses DATABASE_URL from .env.local / .env; rewrites Supabase :6543 → :5432 for CLI.
 */
const { config } = require("dotenv");
const { execSync } = require("child_process");

config({ path: ".env.local" });
config({ path: ".env" });

let url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (url.includes(":6543")) {
  url = url.replaceAll(":6543", ":5432");
  process.stderr.write(
    "Note: using port 5432 for migrate resolve (6543 pooler is unreliable).\n",
  );
}

/** Folder names under prisma/migrations/, oldest first. */
const MIGRATIONS = [
  "20260328000000_baseline_core_schema",
  "20260329030600_add_claimed_quantity",
  "20260329120000_packing_item_sign_ups",
  "20260329180000_signup_packed",
  "20260330120000_packing_item_section",
  "20260330220000_packing_item_quantity_max",
  "20260406120000_advanced_packing_list",
  "20260408120000_packing_sections",
  "20260413120000_event_roles_and_settings",
];

for (const name of MIGRATIONS) {
  process.stderr.write(`\n→ prisma migrate resolve --applied "${name}"\n`);
  try {
    const out = execSync(`npx prisma migrate resolve --applied "${name}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: url },
    });
    if (out) process.stdout.write(out);
  } catch (e) {
    const stderr = e.stderr ? String(e.stderr) : "";
    const stdout = e.stdout ? String(e.stdout) : "";
    process.stderr.write(stderr);
    if (stdout) process.stdout.write(stdout);
    const msg = `${stderr}${stdout}${e.message || ""}`;
    if (/already.*applied|recorded as applied|P3008/i.test(msg)) {
      process.stderr.write(`(skipped — already recorded)\n`);
      continue;
    }
    process.exit(e.status ?? 1);
  }
}

process.stderr.write(
  "\nDone. Verify with: npx prisma migrate status\nThen: npx prisma migrate dev\n",
);
