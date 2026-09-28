import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { evaluateOfflineLicensePeriod, verifyOfflineLicense } from "../src/lib/offlineLicense";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

function license(overrides: Record<string, unknown> = {}) {
  const claims = {
    version: 1, licenseId: "LIC-test-001", officeId: "office-test",
    installationId: "123e4567-e89b-42d3-a456-426614174000", sequence: 1,
    type: "SUBSCRIPTION", plan: "PRO", issuedAt: "2026-08-24T00:00:00.000Z",
    validUntil: "2027-08-24T00:00:00.000Z", gracePeriodDays: 7, ...overrides,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign(null, Buffer.from(payload), privateKey).toString("base64url");
  return JSON.stringify({ payload, signature });
}

test("verifies a valid signed subscription license", () => {
  const result = verifyOfflineLicense(license(), publicKeyBase64);
  assert.equal(result.claims.type, "SUBSCRIPTION");
  assert.equal(result.validUntil?.toISOString(), "2027-08-24T00:00:00.000Z");
});

test("supports perpetual licenses without expiry", () => {
  const result = verifyOfflineLicense(license({ type: "PERPETUAL", validUntil: null, gracePeriodDays: 0 }), publicKeyBase64);
  assert.equal(result.claims.type, "PERPETUAL");
  assert.equal(result.validUntil, null);
});

test("rejects payload and signature tampering", () => {
  const parsed = JSON.parse(license()) as { payload: string; signature: string };
  assert.throws(() => verifyOfflineLicense(JSON.stringify({ ...parsed, payload: `${parsed.payload}A` }), publicKeyBase64), /kanonik|tidak sah/);
  assert.throws(() => verifyOfflineLicense(JSON.stringify({ ...parsed, signature: `${parsed.signature}A` }), publicKeyBase64), /kanonik|tidak sah/);
});

test("evaluates active, grace, exact boundary, and perpetual periods", () => {
  const expiry = new Date("2026-08-24T00:00:00.000Z");
  assert.equal(evaluateOfflineLicensePeriod("SUBSCRIPTION", expiry, 7, new Date("2026-08-23T23:59:59.999Z")).phase, "ACTIVE");
  assert.equal(evaluateOfflineLicensePeriod("SUBSCRIPTION", expiry, 7, expiry).phase, "GRACE");
  assert.equal(evaluateOfflineLicensePeriod("SUBSCRIPTION", expiry, 7, new Date("2026-08-31T00:00:00.000Z")).phase, "READ_ONLY");
  assert.equal(evaluateOfflineLicensePeriod("PERPETUAL", null, 0, new Date("2099-01-01T00:00:00.000Z")).writable, true);
});

test("rejects invalid perpetual and subscription validity", () => {
  assert.throws(() => verifyOfflineLicense(license({ type: "PERPETUAL" }), publicKeyBase64), /perpetual/);
  assert.throws(() => verifyOfflineLicense(license({ validUntil: "2026-08-23T00:00:00.000Z" }), publicKeyBase64), /Masa berlaku/);
});

test("rejects unknown fields and malformed public keys", () => {
  assert.throws(() => verifyOfflineLicense(license({ unexpected: true }), publicKeyBase64), /Struktur/);
  assert.throws(() => verifyOfflineLicense(license(), "not-a-key"), /kunci publik/);
});
