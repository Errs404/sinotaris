import assert from "node:assert/strict";
import { test } from "node:test";
import { createIdentityDraft, mutateIdentityVersion, resolveEffectiveAppointment, resolveDocumentIdentity, validateJobAppointment } from "../../src/lib/officeIdentity";
import { createPekerjaanForActor, updatePekerjaanForActor } from "../../src/lib/pekerjaanService";
import { createInvoiceDraft, issueInvoice } from "../../src/lib/invoiceService";
import { parseInvoiceSnapshot } from "../../src/lib/invoiceUi";
import { createTenantFixtures } from "./fixtures";
import { expectDatabaseRejection, inRollbackTransaction } from "./testDatabase";

test("job edits retain unchanged retired appointment but cannot switch to another retired appointment", async () => {
  await inRollbackTransaction(async tx => {
    const f = await createTenantFixtures(tx);
    const parties = [{ clientId: f.clientA.id, peran: "Penghadap" }];
    const job = await createPekerjaanForActor(tx, f.actorA, { kind: "NOTARIS", jenis: "Akta", judul: "Historical" }, parties);
    const current = await tx.pekerjaan.findUniqueOrThrow({ where: { id: job.id } });
    const appointment = await tx.notaryAppointment.findUniqueOrThrow({ where: { id: current.appointmentId! } });
    await mutateIdentityVersion(tx, f.actorA, "appointment", appointment.id, appointment.updatedAt, "retire", { reason: "Historical appointment" });
    await updatePekerjaanForActor(tx, f.actorA, job.id, current.updatedAt, { appointmentId: appointment.id, judul: "Updated historical job" }, parties);
    const updated = await tx.pekerjaan.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(updated.appointmentId, appointment.id);
    assert.equal((await resolveDocumentIdentity(tx, f.officeA.id, job.id)).appointment?.id, appointment.id);
    const profile = await tx.officeProfileVersion.findUniqueOrThrow({ where: { id: job.officeProfileVersionId! } });
    await mutateIdentityVersion(tx, f.actorA, "profile", profile.id, profile.updatedAt, "retire", { reason: "Historical profile" });
    const nextProfile = await createIdentityDraft(tx, f.actorA, "profile", { officeName: "New profile" });
    await mutateIdentityVersion(tx, f.actorA, "profile", nextProfile.id, nextProfile.updatedAt, "publish");
    const edited = await updatePekerjaanForActor(tx, f.actorA, job.id, updated.updatedAt, { judul: "Still historical" }, parties);
    assert.equal(edited.officeProfileVersionId, profile.id);
    assert.equal((await resolveDocumentIdentity(tx, f.officeA.id, job.id)).profile.id, profile.id);
    const other = await createIdentityDraft(tx, f.actorA, "appointment", { kind: "NOTARIS", notaryName: "Other" });
    await mutateIdentityVersion(tx, f.actorA, "appointment", other.id, other.updatedAt, "publish");
    const published = await tx.notaryAppointment.findUniqueOrThrow({ where: { id: other.id } });
    await mutateIdentityVersion(tx, f.actorA, "appointment", other.id, published.updatedAt, "retire", { reason: "No longer active" });
    const latest = await tx.pekerjaan.findUniqueOrThrow({ where: { id: job.id } });
    await assert.rejects(updatePekerjaanForActor(tx, f.actorA, job.id, latest.updatedAt, { appointmentId: other.id }, parties), /wajib tersedia/);
  });
});

test("identity drafts enforce current Notaris, tenant, OCC, versioning and private audit metadata", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    await assert.rejects(createIdentityDraft(tx, f.actorB, "profile", { officeName: "x" }), /Notaris/);
    await assert.rejects(createIdentityDraft(tx, { ...f.actorA, officeId: f.officeB.id }, "profile", { officeName: "x" }), /Kantor/);
    const draft = await createIdentityDraft(tx, f.actorA, "profile", { officeName: "PRIVATE NAME", address: "PRIVATE ADDRESS" });
    assert.equal(draft.version, 2);
    await mutateIdentityVersion(tx, f.actorA, "profile", draft.id, draft.updatedAt, "update", { officeName: "PRIVATE NEW" });
    await assert.rejects(mutateIdentityVersion(tx, f.actorA, "profile", draft.id, draft.updatedAt, "delete"), /berubah/);
    const current = await tx.officeProfileVersion.findUniqueOrThrow({ where: { id: draft.id } });
    await mutateIdentityVersion(tx, f.actorA, "profile", draft.id, current.updatedAt, "delete");
    const logs = await tx.auditLog.findMany({ where: { targetId: draft.id } });
    assert.equal(logs.length, 3);
    assert.equal(JSON.stringify(logs.map((log) => log.metadata)).includes("PRIVATE"), false);
  });
});

test("publication forbids overlap, immutable history survives retirement, replacement takes precedence", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    const draft = await createIdentityDraft(tx, f.actorA, "profile", { officeName: "Next office" });
    await expectDatabaseRejection(tx, "profile_overlap", () => mutateIdentityVersion(tx, f.actorA, "profile", draft.id, draft.updatedAt, "publish"), /overlap/);
    const old = await tx.officeProfileVersion.findFirstOrThrow({ where: { officeId: f.officeA.id, version: 1 } });
    await expectDatabaseRejection(tx, "profile_immutable", () => tx.officeProfileVersion.update({ where: { id: old.id }, data: { officeName: "forged" } }), /immutable/);
    await expectDatabaseRejection(tx, "profile_delete", () => tx.officeProfileVersion.delete({ where: { id: old.id } }), /cannot be deleted/);
    await mutateIdentityVersion(tx, f.actorA, "profile", old.id, old.updatedAt, "retire", { reason: "Replaced profile" });
    await mutateIdentityVersion(tx, f.actorA, "profile", draft.id, draft.updatedAt, "publish");
    assert.equal((await tx.office.findUniqueOrThrow({ where: { id: f.officeA.id } })).name, "Next office");
    const replacement = await createIdentityDraft(tx, f.actorA, "appointment", { kind: "NOTARIS_PENGGANTI", notaryName: "Replacement" });
    await mutateIdentityVersion(tx, f.actorA, "appointment", replacement.id, replacement.updatedAt, "publish");
    assert.equal((await resolveEffectiveAppointment(tx, f.officeA.id, "NOTARIS"))?.id, replacement.id);
    await assert.rejects(validateJobAppointment(tx, f.officeA.id, "PPAT", replacement.id), /wajib tersedia/);
    await assert.rejects(validateJobAppointment(tx, f.officeB.id, "NOTARIS", replacement.id), /wajib tersedia/);
    const duplicate = await createIdentityDraft(tx, f.actorA, "appointment", { kind: "NOTARIS_PENGGANTI", notaryName: "Duplicate" });
    await expectDatabaseRejection(tx, "appointment_overlap", () => mutateIdentityVersion(tx, f.actorA, "appointment", duplicate.id, duplicate.updatedAt, "publish"), /overlap/);
  });
});

test("job auto-assignment, generated provenance, invoice snapshot and template retention", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    const job = await createPekerjaanForActor(tx, f.actorA, { kind: "NOTARIS", jenis: "Akta", judul: "Identity job" }, [{ clientId: f.clientA.id, peran: "Penghadap" }]);
    const identity = await resolveDocumentIdentity(tx, f.officeA.id, job.id);
    assert.equal(job.officeProfileVersionId, identity.profile.id);
    const foreignProfile = await tx.officeProfileVersion.findFirstOrThrow({ where: { officeId: f.officeB.id } });
    await expectDatabaseRejection(tx, "job_profile_tenant", () => tx.pekerjaan.update({ where: { id: job.id }, data: { officeProfileVersionId: foreignProfile.id } }), /profile tenant/);
    assert.ok(identity.appointment?.id);
    const template = await tx.docTemplate.create({ data: { officeId: f.officeA.id, name: "Identity template", fileName: "test.docx", fieldsJson: [] } });
    const doc = await tx.generatedDoc.create({ data: { officeId: f.officeA.id, templateId: template.id, pekerjaanId: job.id, appointmentId: identity.appointment.id, generatedById: f.actorA.id, identityJson: { ...identity }, fileName: "test.docx", dataJson: {} } });
    await expectDatabaseRejection(tx, "generated_tenant", () => tx.generatedDoc.update({ where: { id: doc.id }, data: { officeId: f.officeB.id } }), /tenant mismatch/);
    await expectDatabaseRejection(tx, "generated_actor", () => tx.generatedDoc.update({ where: { id: doc.id }, data: { generatedById: f.actorB.id } }), /tenant mismatch/);
    await expectDatabaseRejection(tx, "generated_appointment", () => tx.generatedDoc.update({ where: { id: doc.id }, data: { appointmentId: null } }), /identity mismatch/);
    await expectDatabaseRejection(tx, "template_history", () => tx.docTemplate.delete({ where: { id: template.id } }), /Foreign key|foreign key/);
    const invoice = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, pekerjaanId: job.id, items: [{ category: "HONORARIUM", desc: "Test", qty: 1, unitPrice: "100" }] });
    await issueInvoice(tx, f.actorA, invoice.id, invoice.version);
    const before = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.deepEqual(parseInvoiceSnapshot(before.snapshotJson)?.identity, identity);
    const profile = await tx.officeProfileVersion.findUniqueOrThrow({ where: { id: identity.profile.id } });
    await mutateIdentityVersion(tx, f.actorA, "profile", profile.id, profile.updatedAt, "retire", { reason: "New office version" });
    const next = await createIdentityDraft(tx, f.actorA, "profile", { officeName: "Changed office" });
    await mutateIdentityVersion(tx, f.actorA, "profile", next.id, next.updatedAt, "publish");
    assert.deepEqual(await resolveDocumentIdentity(tx, f.officeA.id, job.id), identity);
    assert.equal((await resolveDocumentIdentity(tx, f.officeA.id)).profile.id, next.id);
    await expectDatabaseRejection(tx, "job_profile_provenance", () => tx.pekerjaan.update({ where: { id: job.id }, data: { officeProfileVersionId: next.id } }), /profile provenance/);
    const historicalInvoice = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, pekerjaanId: job.id, items: [{ category: "HONORARIUM", desc: "Historical", qty: 1, unitPrice: "100" }] });
    await issueInvoice(tx, f.actorA, historicalInvoice.id, historicalInvoice.version);
    assert.deepEqual(parseInvoiceSnapshot((await tx.invoice.findUniqueOrThrow({ where: { id: historicalInvoice.id } })).snapshotJson)?.identity, identity);
    assert.deepEqual((await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).snapshotJson, before.snapshotJson);
    assert.deepEqual((await tx.generatedDoc.findUniqueOrThrow({ where: { id: doc.id } })).identityJson, identity);
  });
});
