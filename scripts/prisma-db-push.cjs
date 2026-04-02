/**
 * Supabase transaction pooler (port 6543) often hangs on `prisma db push` / migrations.
 * Session pooler / direct Postgres uses port 5432 on the same host.
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
    "Note: using port 5432 for db push (6543 transaction pooler is unreliable for schema changes).\n",
  );
}

const extra = process.argv.slice(2);
const cmd =
  extra.length > 0
    ? `npx prisma db push ${extra.join(" ")}`
    : "npx prisma db push";
execSync(cmd, {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
