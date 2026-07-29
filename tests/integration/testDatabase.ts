import assert from "node:assert/strict";
import { after } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { validatedTestDatabase } from "./setup";

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const databaseReady = (async () => {
  try {
    const identity = await prisma.$queryRaw<Array<{ database: string; schema: string | null }>>`
      SELECT current_database() AS database, current_schema() AS schema
    `;
    if (
      identity.length !== 1
      || identity[0].database !== validatedTestDatabase.database
      || identity[0].schema !== validatedTestDatabase.schema
    ) {
      throw new Error("database identity mismatch");
    }
  } catch {
    await prisma.$disconnect();
    throw new Error("Integration tests refused: connected PostgreSQL database or schema failed runtime verification.");
  }
})();

const forcedRollback = new Error("integration-test-forced-rollback");

export async function inRollbackTransaction(
  run: (tx: import("../../src/generated/prisma/client").Prisma.TransactionClient) => Promise<void>,
) {
  await databaseReady;
  let completed = false;
  try {
    await prisma.$transaction(async (tx) => {
      await run(tx);
      completed = true;
      throw forcedRollback;
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (completed && error === forcedRollback) return;
    throw error;
  }
  throw new Error("Integration test transaction unexpectedly committed.");
}

export async function expectDatabaseRejection(
  tx: import("../../src/generated/prisma/client").Prisma.TransactionClient,
  savepoint: string,
  operation: () => Promise<unknown>,
  message: RegExp,
) {
  if (!/^[a-z][a-z0-9_]*$/i.test(savepoint)) throw new Error("Invalid savepoint name.");
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await assert.rejects(operation, message);
  } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  }
}

let disconnectPromise: Promise<void> | undefined;
export function disconnectTestDatabase() {
  disconnectPromise ??= prisma.$disconnect();
  return disconnectPromise;
}

after(disconnectTestDatabase);
