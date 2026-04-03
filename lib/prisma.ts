import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

let prismaInstance: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV !== "production" && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  if (prismaInstance) {
    return prismaInstance;
  }
  const client = createPrismaClient();
  prismaInstance = client;
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

/** Lazily creates the client on first use so `next build` can load modules without DATABASE_URL until a query runs. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});
