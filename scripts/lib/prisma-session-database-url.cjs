const { config } = require("dotenv");

/**
 * Load DATABASE_URL from .env.local / .env and rewrite Supabase transaction
 * pooler (6543) to session/direct (5432) for schema CLI commands.
 */
function loadSessionDatabaseUrl(noteLabel) {
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
      `Note: using port 5432 for ${noteLabel} (6543 transaction pooler is unreliable for schema changes).\n`,
    );
  }

  return url;
}

function runPrismaCli(prismaSubcommand, noteLabel) {
  const { execSync } = require("child_process");
  const url = loadSessionDatabaseUrl(noteLabel);
  const extra = process.argv.slice(2);
  const cmd =
    extra.length > 0
      ? `npx prisma ${prismaSubcommand} ${extra.join(" ")}`
      : `npx prisma ${prismaSubcommand}`;
  execSync(cmd, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}

module.exports = { loadSessionDatabaseUrl, runPrismaCli };
