/**
 * Supabase transaction pooler (port 6543) often hangs on `prisma db push` / migrations.
 * Session pooler / direct Postgres uses port 5432 on the same host.
 *
 * For changes that alter existing data (e.g. enum conversions with SQL backfills),
 * use `prisma migrate dev` / `migrate deploy` instead of `db push` — push cannot
 * run custom migration.sql steps and may try to drop columns.
 */
const { runPrismaCli } = require("./lib/prisma-session-database-url.cjs");

runPrismaCli("db push", "db push");
