import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRupiah, multiplyRupiah, parseRupiah, serializeRupiah, sumRupiah } from "../src/lib/money";

test("Rupiah parser accepts canonical digits and Indonesian thousand grouping", () => {
  assert.equal(serializeRupiah(parseRupiah("0")), "0");
  assert.equal(serializeRupiah(parseRupiah("1.234.567")), "1234567");
  assert.equal(serializeRupiah(parseRupiah("9999999999999999")), "9999999999999999");
});

test("Rupiah parser rejects decimals, signs, exponents, malformed grouping, and overflow", () => {
  for (const value of ["1,00", "-1", "+1", "1e3", "01", "1.00", "12.34", "1,000", "10000000000000000", ""]) {
    assert.throws(() => parseRupiah(value), /Nominal/);
  }
});

test("Rupiah arithmetic and formatting remain exact", () => {
  const lines = [multiplyRupiah(parseRupiah("999999999999"), 3), multiplyRupiah(parseRupiah("7"), 9)];
  assert.equal(serializeRupiah(sumRupiah(lines)), "3000000000060");
  assert.equal(formatRupiah("1234567"), "Rp1.234.567");
});
