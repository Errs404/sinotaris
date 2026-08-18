import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  addManualChecklistItem,
  applyChecklistTemplateForPekerjaan,
  assertArchiveChecklistMoveAllowed,
  attachArchiveToChecklistItem,
  calculateChecklistProgress,
  createChecklistTemplate,
  deleteChecklistTemplate,
  detachArchiveFromChecklistItem,
  lockArchiveForChecklistMutation,
  reconcileChecklistItemsAfterArchiveDelete,
  setChecklistItemStatus,
  updateChecklistTemplate,
} from "../../src/lib/checklistService";
import { createPekerjaanForActor, deletePekerjaanForActor, transitionPekerjaanForActor } from "../../src/lib/pekerjaanService";
import { createTenantFixtures } from "./fixtures";
import { expectDatabaseRejection, inRollbackTransaction } from "./testDatabase";

async function createArchive(
  tx: Parameters<Parameters<typeof inRollbackTransaction>[0]>[0],
  officeId: string,
  uploadedById: string,
  type: "KTP" | "NPWP" = "KTP",
  pekerjaanId: string | null = null,
) {
  return tx.documentArchive.create({
    data: {
      officeId,
      uploadedById,
      pekerjaanId,
      type,
      originalName: `SECRET-FILENAME-${randomUUID()}.pdf`,
      storageKey: `integration/${randomUUID()}`,
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksum: randomUUID().replaceAll("-", ""),
      rawText: "SECRET-RAW-OCR",
      extractedJson: {},
    },
  });
}

async function itemVersion(
  tx: Parameters<Parameters<typeof inRollbackTransaction>[0]>[0],
  id: string,
) {
  return (await tx.pekerjaanChecklistItem.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt;
}

test("template CRUD is Notaris-only, tenant-scoped, normalized, and safely audited", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const staffA = await tx.user.create({ data: {
      officeId: fixture.officeA.id,
      name: "Checklist Staff",
      email: `checklist-staff-${fixture.suffix}@integration.test`,
      passwordHash: "not-used",
      role: "STAF",
    } });
    const notarisB = await tx.user.create({ data: {
      officeId: fixture.officeB.id,
      name: "Checklist Notaris B",
      email: `checklist-notaris-b-${fixture.suffix}@integration.test`,
      passwordHash: "not-used",
      role: "NOTARIS",
    } });
    const labelSentinel = "SECRET-LABEL-KTP";
    await assert.rejects(createChecklistTemplate(tx, staffA, {
      kind: "NOTARIS", jenis: "Akta Wasiat", name: "Forbidden", items: [],
    }), /Hanya Notaris/);

    const template = await createChecklistTemplate(tx, fixture.actorA, {
      kind: "NOTARIS",
      jenis: "  Àkta   Wasiat  ",
      name: "Persyaratan Wasiat",
      items: [
        { label: labelSentinel, expectedType: "KTP", required: true },
        { key: "npwp-pihak", label: "NPWP", expectedType: "NPWP", required: false },
      ],
    });
    const stored = await tx.checklistTemplate.findUniqueOrThrow({ where: { id: template.id }, include: { items: true } });
    assert.equal(stored.jenisKey, "akta-wasiat");
    assert.deepEqual(stored.items.map((item) => item.key).sort(), ["npwp-pihak", "secret-label-ktp"]);
    await assert.rejects(deleteChecklistTemplate(tx, notarisB, template.id, template.updatedAt), /tidak ditemukan/);

    const updated = await updateChecklistTemplate(tx, fixture.actorA, template.id, template.updatedAt, {
      kind: "NOTARIS",
      jenis: "Akta Wasiat",
      name: "Persyaratan Wasiat Aktif",
      isActive: true,
      items: [{ key: "ktp", label: labelSentinel, expectedType: "KTP", required: true }],
    });
    await assert.rejects(updateChecklistTemplate(tx, fixture.actorA, template.id, template.updatedAt, {
      kind: "NOTARIS", jenis: "Akta Wasiat", name: "Stale", items: [],
    }), /sudah diubah/);
    await deleteChecklistTemplate(tx, fixture.actorA, template.id, updated.updatedAt);
    assert.equal(await tx.checklistTemplate.count({ where: { id: template.id } }), 0);

    const audits = await tx.auditLog.findMany({ where: { officeId: fixture.officeA.id, targetId: template.id } });
    assert.deepEqual(audits.map((audit) => audit.action).sort(), [
      "CHECKLIST_TEMPLATE_CREATE", "CHECKLIST_TEMPLATE_DELETE", "CHECKLIST_TEMPLATE_UPDATE",
    ]);
    assert.equal(JSON.stringify(audits.map((audit) => audit.metadata)).includes(labelSentinel), false);
  });
});

test("matching template auto-instantiates snapshots; updates and deletion do not rewrite snapshots; manual apply adds missing only", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const template = await createChecklistTemplate(tx, fixture.actorA, {
      kind: "PPAT",
      jenis: "Akta Jual Beli",
      name: "AJB",
      items: [
        { key: "ktp", label: "KTP Lama", expectedType: "KTP", required: true, sortOrder: 0 },
        { key: "npwp", label: "NPWP", expectedType: "NPWP", required: false, sortOrder: 1 },
      ],
    });
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "PPAT", jenis: "  ÀKTA jual-beli ", judul: "Checklist otomatis",
    }, []);
    let snapshots = await tx.pekerjaanChecklistItem.findMany({ where: { pekerjaanId: pekerjaan.id }, orderBy: { sortOrder: "asc" } });
    assert.deepEqual(snapshots.map((item) => item.key), ["ktp", "npwp"]);
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id, action: "CHECKLIST_APPLY" } }), 1);

    const updated = await updateChecklistTemplate(tx, fixture.actorA, template.id, template.updatedAt, {
      kind: "PPAT",
      jenis: "Akta Jual Beli",
      name: "AJB updated",
      items: [
        { key: "ktp", label: "KTP Baru", expectedType: "KTP", required: true },
        { key: "npwp", label: "NPWP Baru", expectedType: "NPWP", required: false },
        { key: "sertipikat", label: "Sertipikat", expectedType: "SERTIPIKAT", required: true },
      ],
    });
    snapshots = await tx.pekerjaanChecklistItem.findMany({ where: { pekerjaanId: pekerjaan.id }, orderBy: { sortOrder: "asc" } });
    assert.deepEqual(snapshots.map((item) => item.label), ["KTP Lama", "NPWP"]);
    assert.ok(snapshots.every((item) => item.templateItemId === null));

    const applied = await applyChecklistTemplateForPekerjaan(tx, fixture.actorA, pekerjaan.id);
    assert.equal(applied.addedCount, 1);
    const secondApply = await applyChecklistTemplateForPekerjaan(tx, fixture.actorA, pekerjaan.id);
    assert.equal(secondApply.addedCount, 0);
    assert.equal(await tx.pekerjaanChecklistItem.count({ where: { pekerjaanId: pekerjaan.id } }), 3);

    await deleteChecklistTemplate(tx, fixture.actorA, template.id, updated.updatedAt);
    assert.equal(await tx.pekerjaanChecklistItem.count({ where: { pekerjaanId: pekerjaan.id } }), 3);
    assert.equal(await tx.pekerjaanChecklistItem.count({ where: { pekerjaanId: pekerjaan.id, templateItemId: { not: null } } }), 0);

    const noMatch = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Jual Beli", judul: "Kind berbeda",
    }, []);
    assert.equal(await tx.pekerjaanChecklistItem.count({ where: { pekerjaanId: noMatch.id } }), 0);
  });
});

test("attachment, review, progress, tenant boundaries, and archive deletion reconciliation are enforced", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const staffA = await tx.user.create({ data: {
      officeId: fixture.officeA.id,
      name: "Checklist Staff A",
      email: `attachment-staff-${fixture.suffix}@integration.test`,
      passwordHash: "not-used",
      role: "STAF",
    } });
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Legacy", judul: "Manual checklist",
    }, []);
    const required = await addManualChecklistItem(tx, fixture.actorA, pekerjaan.id, {
      label: "KTP Pihak", required: true, expectedType: "KTP",
    });
    const optional = await addManualChecklistItem(tx, fixture.actorA, pekerjaan.id, {
      label: "NPWP Tambahan", required: false, expectedType: "NPWP",
    });
    await assert.rejects(addManualChecklistItem(tx, staffA, pekerjaan.id, { label: "Forbidden" }), /Hanya Notaris/);

    const wrongOfficeArchive = await createArchive(tx, fixture.officeB.id, fixture.actorB.id);
    await assert.rejects(attachArchiveToChecklistItem(tx, staffA, required.id, wrongOfficeArchive.id, await itemVersion(tx, required.id)), /Arsip tidak ditemukan/);
    await assert.rejects(attachArchiveToChecklistItem(tx, fixture.actorB, required.id, wrongOfficeArchive.id, await itemVersion(tx, required.id)), /Item checklist tidak ditemukan/);
    const otherPekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Other", judul: "Other",
    }, []);
    const linkedElsewhere = await createArchive(tx, fixture.officeA.id, fixture.actorA.id, "KTP", otherPekerjaan.id);
    await assert.rejects(attachArchiveToChecklistItem(tx, staffA, required.id, linkedElsewhere.id, await itemVersion(tx, required.id)), /pekerjaan lain/);
    await assert.rejects(setChecklistItemStatus(tx, fixture.actorA, required.id, "TERVERIFIKASI", await itemVersion(tx, required.id)), /harus memiliki lampiran/);

    const archive = await createArchive(tx, fixture.officeA.id, fixture.actorA.id, "NPWP");
    const staleVersion = new Date((await itemVersion(tx, required.id)).getTime() - 1);
    await assert.rejects(
      attachArchiveToChecklistItem(tx, staffA, required.id, archive.id, staleVersion),
      /sudah diubah/,
    );
    const attached = await attachArchiveToChecklistItem(tx, staffA, required.id, archive.id, await itemVersion(tx, required.id));
    assert.equal(attached.resultingStatus, "TERLAMPIR");
    const absentDetachVersion = await itemVersion(tx, required.id);
    const absentDetachAuditCount = await tx.auditLog.count({ where: { action: "CHECKLIST_ATTACHMENT_UPDATE", targetId: pekerjaan.id } });
    const absentDetach = await detachArchiveFromChecklistItem(tx, staffA, required.id, randomUUID(), absentDetachVersion);
    assert.equal(absentDetach.removed, false);
    assert.equal((await itemVersion(tx, required.id)).getTime(), absentDetachVersion.getTime());
    assert.equal(await tx.auditLog.count({ where: { action: "CHECKLIST_ATTACHMENT_UPDATE", targetId: pekerjaan.id } }), absentDetachAuditCount);
    assert.equal((await tx.documentArchive.findUniqueOrThrow({ where: { id: archive.id } })).pekerjaanId, pekerjaan.id);
    assert.equal((await tx.pekerjaanChecklistItem.findUniqueOrThrow({ where: { id: required.id } })).status, "TERLAMPIR");
    assert.equal((await tx.pekerjaanChecklistItem.findUniqueOrThrow({ where: { id: required.id } })).status === "TERVERIFIKASI", false);
    await assert.rejects(
      assertArchiveChecklistMoveAllowed(tx, fixture.officeA.id, (await lockArchiveForChecklistMutation(tx, fixture.officeA.id, archive.id))!, otherPekerjaan.id),
      /masih dipakai oleh checklist/,
    );
    await assertArchiveChecklistMoveAllowed(tx, fixture.officeA.id, (await lockArchiveForChecklistMutation(tx, fixture.officeA.id, archive.id))!, pekerjaan.id);
    await assert.rejects(setChecklistItemStatus(tx, staffA, required.id, "TERVERIFIKASI", await itemVersion(tx, required.id)), /Hanya Notaris/);

    await setChecklistItemStatus(tx, fixture.actorA, required.id, "TERVERIFIKASI", await itemVersion(tx, required.id));
    const duplicateVersion = await itemVersion(tx, required.id);
    const duplicateAuditCount = await tx.auditLog.count({ where: { action: "CHECKLIST_ATTACHMENT_UPDATE", targetId: pekerjaan.id } });
    const duplicate = await attachArchiveToChecklistItem(tx, staffA, required.id, archive.id, duplicateVersion);
    assert.equal(duplicate.added, false);
    assert.equal((await itemVersion(tx, required.id)).getTime(), duplicateVersion.getTime());
    assert.equal(await tx.auditLog.count({ where: { action: "CHECKLIST_ATTACHMENT_UPDATE", targetId: pekerjaan.id } }), duplicateAuditCount);
    assert.equal((await tx.pekerjaanChecklistItem.findUniqueOrThrow({ where: { id: required.id } })).status, "TERVERIFIKASI");
    const secondEvidence = await createArchive(tx, fixture.officeA.id, fixture.actorA.id, "KTP", pekerjaan.id);
    await attachArchiveToChecklistItem(tx, staffA, required.id, secondEvidence.id, await itemVersion(tx, required.id));
    assert.equal((await tx.pekerjaanChecklistItem.findUniqueOrThrow({ where: { id: required.id } })).status, "TERLAMPIR");
    await assert.rejects(setChecklistItemStatus(tx, fixture.actorA, required.id, "DITOLAK", await itemVersion(tx, required.id), "x"), /minimal 3/);
    const reasonSentinel = "SECRET-REJECTION-REASON";
    await setChecklistItemStatus(tx, fixture.actorA, required.id, "DITOLAK", await itemVersion(tx, required.id), reasonSentinel);
    await assert.rejects(setChecklistItemStatus(tx, fixture.actorA, required.id, "DILEWATI", await itemVersion(tx, required.id)), /wajib tidak dapat dilewati/);
    await assert.rejects(
      setChecklistItemStatus(tx, fixture.actorA, optional.id, "DITOLAK", await itemVersion(tx, optional.id), "Tidak lengkap"),
      /harus memiliki lampiran/,
    );
    const optionalArchive = await createArchive(tx, fixture.officeA.id, fixture.actorA.id, "NPWP", pekerjaan.id);
    await attachArchiveToChecklistItem(tx, staffA, optional.id, optionalArchive.id, await itemVersion(tx, optional.id));
    await assert.rejects(
      setChecklistItemStatus(tx, fixture.actorA, optional.id, "DILEWATI", await itemVersion(tx, optional.id)),
      /dengan lampiran tidak dapat dilewati/,
    );
    await detachArchiveFromChecklistItem(tx, staffA, optional.id, optionalArchive.id, await itemVersion(tx, optional.id));
    await setChecklistItemStatus(tx, fixture.actorA, optional.id, "DILEWATI", await itemVersion(tx, optional.id));
    const skipVersion = await itemVersion(tx, optional.id);
    const statusAuditCount = await tx.auditLog.count({ where: { action: "CHECKLIST_STATUS_CHANGE", targetId: pekerjaan.id } });
    await setChecklistItemStatus(tx, fixture.actorA, optional.id, "DILEWATI", skipVersion);
    assert.equal((await itemVersion(tx, optional.id)).getTime(), skipVersion.getTime());
    assert.equal(await tx.auditLog.count({ where: { action: "CHECKLIST_STATUS_CHANGE", targetId: pekerjaan.id } }), statusAuditCount);

    let rows = await tx.pekerjaanChecklistItem.findMany({ where: { pekerjaanId: pekerjaan.id }, select: { required: true, status: true } });
    assert.deepEqual(calculateChecklistProgress(rows), {
      requiredTotal: 1, requiredVerified: 0, optionalTotal: 1, optionalComplete: 1, complete: false,
    });
    await setChecklistItemStatus(tx, fixture.actorA, required.id, "TERVERIFIKASI", await itemVersion(tx, required.id));
    rows = await tx.pekerjaanChecklistItem.findMany({ where: { pekerjaanId: pekerjaan.id }, select: { required: true, status: true } });
    assert.equal(calculateChecklistProgress(rows).complete, true);

    await assert.rejects(
      detachArchiveFromChecklistItem(tx, staffA, required.id, secondEvidence.id, staleVersion),
      /sudah diubah/,
    );
    await assert.rejects(
      setChecklistItemStatus(tx, fixture.actorA, required.id, "TERVERIFIKASI", staleVersion),
      /sudah diubah/,
    );
    await detachArchiveFromChecklistItem(tx, staffA, required.id, secondEvidence.id, await itemVersion(tx, required.id));
    await detachArchiveFromChecklistItem(tx, staffA, required.id, archive.id, await itemVersion(tx, required.id));
    assert.equal((await tx.pekerjaanChecklistItem.findUniqueOrThrow({ where: { id: required.id } })).status, "KOSONG");
    await attachArchiveToChecklistItem(tx, staffA, required.id, archive.id, await itemVersion(tx, required.id));
    await setChecklistItemStatus(tx, fixture.actorA, required.id, "TERVERIFIKASI", await itemVersion(tx, required.id));
    const affected = await tx.pekerjaanChecklistAttachment.findMany({ where: { archiveId: archive.id }, select: { itemId: true } });
    await tx.documentArchive.delete({ where: { id: archive.id } });
    await reconcileChecklistItemsAfterArchiveDelete(tx, fixture.officeA.id, affected.map((item) => item.itemId));
    const reconciled = await tx.pekerjaanChecklistItem.findUniqueOrThrow({ where: { id: required.id } });
    assert.equal(reconciled.status, "KOSONG");
    assert.equal(reconciled.verifiedAt, null);

    const auditJson = JSON.stringify((await tx.auditLog.findMany({
      where: { officeId: fixture.officeA.id, action: { in: ["CHECKLIST_ATTACHMENT_UPDATE", "CHECKLIST_STATUS_CHANGE"] } },
      select: { metadata: true },
    })).map((audit) => audit.metadata));
    assert.equal(auditJson.includes(reasonSentinel), false);
    assert.equal(auditJson.includes("SECRET-FILENAME"), false);
    assert.equal(auditJson.includes("SECRET-RAW-OCR"), false);
  });
});

test("database triggers reject direct cross-office checklist rows", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaanA = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Trigger", judul: "Trigger tenant guard",
    }, []);
    const item = await addManualChecklistItem(tx, fixture.actorA, pekerjaanA.id, { label: "Guard item" });
    const archiveA = await createArchive(tx, fixture.officeA.id, fixture.actorA.id, "KTP", pekerjaanA.id);

    await expectDatabaseRejection(tx, "cross_office_item", () => tx.$executeRaw`
      INSERT INTO "PekerjaanChecklistItem"
        ("id", "officeId", "pekerjaanId", "key", "label", "updatedAt")
      VALUES
        (${randomUUID()}, ${fixture.officeB.id}, ${pekerjaanA.id}, ${`cross-${randomUUID()}`}, 'Cross office', CURRENT_TIMESTAMP)
    `, /same office/);

    await expectDatabaseRejection(tx, "cross_office_attachment", () => tx.$executeRaw`
      INSERT INTO "PekerjaanChecklistAttachment"
        ("id", "officeId", "itemId", "archiveId", "createdById")
      VALUES
        (${randomUUID()}, ${fixture.officeB.id}, ${item.id}, ${archiveA.id}, ${fixture.actorB.id})
    `, /same office/);
  });
});

test("hard delete rejects pekerjaan with checklist and writes no delete audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Delete guard", judul: "Checklist harus dipertahankan",
    }, []);
    await addManualChecklistItem(tx, fixture.actorA, pekerjaan.id, { label: "Dokumen wajib" });
    const current = await tx.pekerjaan.findUniqueOrThrow({
      where: { id: pekerjaan.id },
      select: { updatedAt: true },
    });

    await assert.rejects(
      deletePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, current.updatedAt),
      /tidak dapat dihapus permanen.*Batalkan pekerjaan/,
    );

    assert.equal(await tx.pekerjaan.count({ where: { id: pekerjaan.id } }), 1);
    assert.equal(await tx.pekerjaanChecklistItem.count({ where: { pekerjaanId: pekerjaan.id } }), 1);
    assert.equal(await tx.auditLog.count({
      where: { targetId: pekerjaan.id, action: "PEKERJAAN_DELETE" },
    }), 0);
  });
});

test("transition audit records missing required checklist count without blocking", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Transition", judul: "Checklist warning metadata",
    }, []);
    await addManualChecklistItem(tx, fixture.actorA, pekerjaan.id, { label: "Wajib belum lengkap", required: true });
    const pekerjaanVersion = (await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id }, select: { updatedAt: true } })).updatedAt;
    const proses = await transitionPekerjaanForActor(tx, fixture.actorA, pekerjaan.id, pekerjaanVersion, "PROSES");
    await transitionPekerjaanForActor(tx, fixture.actorA, pekerjaan.id, proses.updatedAt, "TANDA_TANGAN");
    const audit = await tx.auditLog.findFirstOrThrow({
      where: { targetId: pekerjaan.id, action: "PEKERJAAN_STATUS_CHANGE" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    assert.equal((audit.metadata as Record<string, unknown>).missingRequiredAtTransition, 1);
  });
});
