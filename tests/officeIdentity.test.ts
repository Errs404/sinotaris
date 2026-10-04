import assert from "node:assert/strict";
import { test } from "node:test";
import { appointmentMatchesKind, identityPlaceholders, normalizeAppointmentInput, normalizeProfileInput, parseIdentityDate, selectEffectiveAppointment } from "../src/lib/officeIdentity";

test("identity dates reject rollover, times and malformed inputs", () => {
  assert.equal(parseIdentityDate("2024-02-29")?.toISOString(), "2024-02-29T00:00:00.000Z");
  assert.equal(parseIdentityDate(""), null);
  for (const value of ["2026-02-29", "2026-04-31", "2026-1-01", "2026-01-01T00:00:00Z", 123]) assert.throws(() => parseIdentityDate(value));
});

test("normalization bounds text and dates without parsing legacy decree text", () => {
  assert.equal(normalizeProfileInput({ officeName: " Office " }).officeName, "Office");
  assert.throws(() => normalizeProfileInput({ officeName: "x", effectiveFrom: "2026-05-02", effectiveUntil: "2026-05-01" }));
  assert.throws(() => normalizeProfileInput({ officeName: "x", email: "bad" }));
  assert.throws(() => normalizeProfileInput({ officeName: "x", logoStorageKey: "arbitrary" }));
  assert.throws(() => normalizeAppointmentInput({ kind: "OTHER", notaryName: "x" }));
  const appointment = normalizeAppointmentInput({ kind: "NOTARIS", notaryName: " Name ", decreeDateText: "Tanggal lama tidak baku" });
  assert.equal(appointment.decreeDate, null);
  assert.equal(appointment.decreeDateText, "Tanggal lama tidak baku");
});

test("replacement overlays regular appointments with inclusive bounds and ambiguity detection", () => {
  const regular = { kind: "NOTARIS" as const, status: "PUBLISHED", effectiveFrom: null, effectiveUntil: null };
  const replacement = { ...regular, kind: "NOTARIS_PENGGANTI" as const, effectiveFrom: parseIdentityDate("2026-05-01"), effectiveUntil: parseIdentityDate("2026-05-02") };
  assert.equal(selectEffectiveAppointment([regular, replacement], "NOTARIS", parseIdentityDate("2026-05-01")!), replacement);
  assert.equal(selectEffectiveAppointment([regular, replacement], "NOTARIS", parseIdentityDate("2026-05-02")!), replacement);
  assert.equal(selectEffectiveAppointment([regular, replacement], "NOTARIS", parseIdentityDate("2026-05-03")!), regular);
  assert.equal(selectEffectiveAppointment([regular, replacement], "PPAT", new Date()), null);
  assert.throws(() => selectEffectiveAppointment([regular, regular], "NOTARIS", new Date()), /ambigu/);
  assert.equal(appointmentMatchesKind("PPAT", "NOTARIS_PENGGANTI"), false);
});

test("authoritative placeholders clear absent values and preserve legacy decree text", () => {
  const identity = { profile: { id: "p", version: 1, officeName: "Office", address: null, phone: null, email: null }, appointment: {
    id: "a", version: 1, kind: "NOTARIS" as const, notaryName: "Name", title: "Title", workArea: null, decreeNumber: null, decreeDate: null, decreeDateText: "Legacy date",
  } };
  const data: Record<string, string> = { nama_notaris: "FORGED", alamat_kantor_notaris: "FORGED", ...identityPlaceholders(identity) };
  assert.equal(data.nama_notaris, "Name");
  assert.equal(data.alamat_kantor_notaris, "");
  assert.equal(data.sk_notaris_tanggal, "Legacy date");
  assert.equal(data.ttd_notaris, "Name, Title");
  assert.doesNotThrow(() => JSON.stringify(identity));
});
