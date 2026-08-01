import assert from "node:assert/strict";
import {
  __testBoundedTargetDimensions,
  __testDocumentStructureScore,
  __testOcrEarlyStopScore,
  __testRotationOrder,
  OcrQueue,
} from "../src/lib/archiveExtraction";

const landscapeOrder = __testRotationOrder(1600, 1000);
assert.deepEqual(landscapeOrder, [0, 180, 90, 270]);
assert.deepEqual([...landscapeOrder].sort((a, b) => a - b), [0, 90, 180, 270]);

const portraitOrder = __testRotationOrder(800, 1400);
assert.deepEqual(portraitOrder, [0, 90, 270, 180]);

const noisyKtp = `PROVINSI JAWA TENGAH
N1K: 32O1 I5B8 Z2G6 O123
Narna: SITI AMINAH
Alarnat: JALAN MELATI
Kecarnatan: BANJARSARI
Pekeriaan: NOTARIS`;
const prose = "Dokumen ini menerangkan kegiatan rapat warga dan rencana kerja tahunan. Semua peserta menyampaikan pendapat dengan tertib.";
const labelHeavyProse = "Nama, alamat, pekerjaan, agama, pendidikan, perkawinan, hubungan, kelamin, dan lahir adalah contoh unsur data yang dibahas dalam rapat.";
const gibberish = "xqz !! @@ 17 abc noise random";

const noisyScore = __testDocumentStructureScore(noisyKtp);
assert.ok(noisyScore >= __testOcrEarlyStopScore, `Expected strong noisy KTP score, received ${noisyScore}`);
assert.ok(noisyScore > __testDocumentStructureScore(gibberish));
assert.ok(noisyScore > __testDocumentStructureScore(prose));
assert.ok(__testDocumentStructureScore("NIK: 32O1 I5B8 Z2G6 O123") >= 50);
assert.ok(__testDocumentStructureScore("NIK: 12 345 678 9O1 2345") >= 40);
assert.ok(__testDocumentStructureScore(prose) < __testOcrEarlyStopScore);
assert.ok(__testDocumentStructureScore(labelHeavyProse) < __testOcrEarlyStopScore);

const upscaled = __testBoundedTargetDimensions(800, 1200, 10_000_000);
assert.ok(Math.abs(upscaled.width - 2000) <= 1);
assert.equal(upscaled.height, 3000);
assert.ok(upscaled.width * upscaled.height <= 10_000_000);

const capped = __testBoundedTargetDimensions(1000, 10_000, 8_000_000);
assert.ok(capped.width * capped.height <= 8_000_000);
assert.ok(Math.abs(capped.width / capped.height - 0.1) < 0.001);

assert.deepEqual(__testBoundedTargetDimensions(2400, 1600, 10_000_000), { width: 2000, height: 1333 });
const pixelBounded = __testBoundedTargetDimensions(4000, 3000, 10_000_000, 5000);
assert.ok(pixelBounded.width * pixelBounded.height <= 10_000_000);
assert.ok(Math.abs(pixelBounded.width / pixelBounded.height - 4 / 3) < 0.001);

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function testOcrQueue(): Promise<void> {
  const queue = new OcrQueue(1, 2, 20);
  const activeGate = deferred<void>();
  const calls: string[] = [];
  const active = queue.run(async () => {
    calls.push("active");
    await activeGate.promise;
    return "active-result";
  });
  const firstWaiting = queue.run(async () => {
    calls.push("first-waiting");
    return "first-result";
  });
  const secondWaiting = queue.run(async () => {
    calls.push("second-waiting");
    return "second-result";
  });
  await assert.rejects(
    queue.run(async () => "must-not-run"),
    /Antrean OCR penuh/,
  );
  assert.deepEqual(calls, ["active"]);

  const expired = await Promise.allSettled([firstWaiting, secondWaiting]);
  for (const result of expired) {
    assert.equal(result.status, "rejected");
    assert.match(String(result.reason), /Waktu tunggu antrean OCR/);
  }
  assert.deepEqual(calls, ["active"], "Expired jobs must never invoke their callbacks");

  activeGate.resolve();
  assert.equal(await active, "active-result");
  const recovered = await queue.run(async () => {
    calls.push("recovered");
    return "recovered-result";
  });
  assert.equal(recovered, "recovered-result");
  assert.deepEqual(calls, ["active", "recovered"]);

  await assert.rejects(
    queue.run(async () => {
      throw new Error("expected callback failure");
    }),
    /expected callback failure/,
  );
  assert.equal(await queue.run(async () => "after-failure"), "after-failure");
}

void testOcrQueue()
  .then(() => console.log("OCR helper tests passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
