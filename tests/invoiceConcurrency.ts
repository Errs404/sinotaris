import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInvoiceDraft, createPayment, issueInvoice, reconcileInvoiceTotalPaid } from "../src/lib/invoiceService";
import { indonesiaTodayDateOnly } from "../src/lib/pekerjaanUi";
import { createTenantFixtures } from "./integration/fixtures";
import { prisma } from "./integration/testDatabase";

async function main() {
  if (process.env.ALLOW_DIRTY_DISPOSABLE_TEST_DB !== "1") {
    throw new Error("Refusing: set ALLOW_DIRTY_DISPOSABLE_TEST_DB=1 only for an ephemeral test database.");
  }
  const setup = await prisma.$transaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const item = { category: "HONORARIUM" as const, desc: "Jasa akta", qty: 1, unitPrice: "1000000" };
    const first = await createInvoiceDraft(tx, fixture.actorA, { clientId: fixture.clientA.id, items: [item] });
    const second = await createInvoiceDraft(tx, fixture.actorA, { clientId: fixture.clientA.id, items: [item] });
    return { actor: fixture.actorA, first, second };
  });
  const issueOne = (id: string) => prisma.$transaction((tx) => issueInvoice(tx, setup.actor, id, 1), { maxWait: 10_000, timeout: 30_000 });
  const [firstIssued, secondIssued] = await Promise.all([issueOne(setup.first.id), issueOne(setup.second.id)]);
  assert.notEqual(firstIssued.number, secondIssued.number);
  const pay = (requestKey: string) => prisma.$transaction((tx) => createPayment(tx, setup.actor, setup.first.id, firstIssued.version, {
    amount: "700000", paidAt: indonesiaTodayDateOnly(), method: "TRANSFER", requestKey,
  }), { maxWait: 10_000, timeout: 30_000 });
  const results = await Promise.allSettled([pay(randomUUID()), pay(randomUUID())]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: setup.first.id } });
  assert.equal(stored.totalPaid.toFixed(0), "700000");
  assert.equal((await reconcileInvoiceTotalPaid(prisma, setup.actor.officeId, setup.first.id)).matches, true);
  console.log("Invoice concurrency checks passed on disposable database.");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await prisma.$disconnect();
  process.exit(1);
});
