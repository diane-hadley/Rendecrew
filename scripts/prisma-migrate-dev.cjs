const { runPrismaCli } = require("./lib/prisma-session-database-url.cjs");

runPrismaCli("migrate dev", "migrate");
