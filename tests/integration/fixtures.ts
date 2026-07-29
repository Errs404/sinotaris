import { randomUUID } from "node:crypto";
import type { Prisma } from "../../src/generated/prisma/client";

export async function createTenantFixtures(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const officeA = await tx.office.create({ data: { name: `Test Office A ${suffix}`, notarisName: "Test Notaris A" } });
  const officeB = await tx.office.create({ data: { name: `Test Office B ${suffix}`, notarisName: "Test Notaris B" } });
  const actorA = await tx.user.create({
    data: {
      officeId: officeA.id,
      name: "Test Actor A",
      email: `actor-a-${suffix}@integration.test`,
      passwordHash: "not-used",
      role: "NOTARIS",
    },
  });
  const actorB = await tx.user.create({
    data: {
      officeId: officeB.id,
      name: "Test Actor B",
      email: `actor-b-${suffix}@integration.test`,
      passwordHash: "not-used",
      role: "STAF",
    },
  });
  const inactiveA = await tx.user.create({
    data: {
      officeId: officeA.id,
      name: "Inactive Test Actor",
      email: `inactive-${suffix}@integration.test`,
      passwordHash: "not-used",
      role: "STAF",
      isActive: false,
    },
  });
  const clientA = await tx.client.create({ data: { officeId: officeA.id, name: "Client A" } });
  const clientB = await tx.client.create({ data: { officeId: officeB.id, name: "Client B" } });
  return { suffix, officeA, officeB, actorA, actorB, inactiveA, clientA, clientB };
}
