/**
 * Same DATABASE_URL port fix as prisma-db-push.cjs: Supabase transaction pooler
 * (6543) is unreliable for migrations; use session/direct (5432) when present.
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
  url = url.replace(":6543", ":5432");
  process.stderr.write(
    "Note: using port 5432 for migrate (6543 transaction pooler is unreliable for schema changes).\n",
  );
}

const extra = process.argv.slice(2);
const cmd =
  extra.length > 0
    ? `npx prisma migrate dev ${extra.join(" ")}`
    : "npx prisma migrate dev";
execSync(cmd, {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
