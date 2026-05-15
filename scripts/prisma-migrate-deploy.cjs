const { runPrismaCli } = require("./lib/prisma-session-database-url.cjs");

runPrismaCli("migrate deploy", "migrate deploy");
