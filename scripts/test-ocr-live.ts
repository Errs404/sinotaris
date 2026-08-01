import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { extractArchiveText } from "../src/lib/archiveExtraction";
import { parseArchiveText } from "../src/lib/archiveParser";
import type { ArchiveTypeValue } from "../src/lib/archiveTypes";

type LiveCase = {
  label: string;
  type: ArchiveTypeValue;
  rotation: 0 | 90 | 180 | 270;
  lines: string[];
  expected: Record<string, string>;
};

function createDocument(lines: string[]): Buffer {
  const canvas = createCanvas(2_000, 1_300);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.font = "bold 54px Arial";
  context.textBaseline = "top";
  lines.forEach((line, index) => context.fillText(line, 90, 70 + index * 105));
  return canvas.toBuffer("image/png");
}

async function physicallyRotate(buffer: Buffer, degrees: 0 | 90 | 180 | 270): Promise<Buffer> {
  if (degrees === 0) return buffer;
  const image = await loadImage(buffer);
  const swapsAxes = degrees === 90 || degrees === 270;
  const canvas = createCanvas(swapsAxes ? image.height : image.width, swapsAxes ? image.width : image.height);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas.toBuffer("image/png");
}

const cases: LiveCase[] = [
  {
    label: "KTP-180",
    type: "KTP",
    rotation: 180,
    lines: [
      "PROVINSI JAWA TENGAH",
      "NIK: 1234567890123456",
      "Nama: BUDI SANTOSO",
      "Tempat/Tgl Lahir: SOLO, 05-06-1988",
      "Jenis Kelamin: LAKI-LAKI",
      "Alamat: JALAN MELATI",
      "Kecamatan: BANJARSARI",
      "Pekerjaan: NOTARIS",
      "Kewarganegaraan: WNI",
      "Berlaku Hingga: SEUMUR HIDUP",
    ],
    expected: { nik: "1234567890123456", name: "BUDI SANTOSO" },
  },
  {
    label: "KK-upright",
    type: "KARTU_KELUARGA",
    rotation: 0,
    lines: [
      "KARTU KELUARGA",
      "No. KK: 3273010101010001",
      "Nama Kepala Keluarga: SITI AMINAH",
      "Alamat: JALAN KENANGA",
      "RT/RW: 001/002",
      "Kelurahan: MANAHAN",
      "Kecamatan: BANJARSARI",
      "Kabupaten/Kota: SURAKARTA",
      "Provinsi: JAWA TENGAH",
    ],
    expected: { nomorKk: "3273010101010001", name: "SITI AMINAH" },
  },
  {
    label: "NPWP-90",
    type: "NPWP",
    rotation: 90,
    lines: [
      "NOMOR POKOK WAJIB PAJAK",
      "NPWP: 12.345.678.9-012.345",
      "Nama Wajib Pajak: RINA KUSUMA",
      "Alamat: JALAN ANGGREK",
      "Kecamatan: MENTENG",
      "Pekerjaan: NOTARIS",
      "NOMOR: 001",
    ],
    expected: { npwp: "123456789012345", name: "RINA KUSUMA" },
  },
];

async function main(): Promise<void> {
  for (const testCase of cases) {
    const image = await physicallyRotate(createDocument(testCase.lines), testCase.rotation);
    const text = await extractArchiveText(image, "image/png");
    const parsed = parseArchiveText(text, testCase.type);
    for (const [field, expected] of Object.entries(testCase.expected)) {
      assert.equal(parsed.fields[field], expected, `${testCase.label}: field ${field} dari OCR tidak sesuai`);
    }
    console.log(`${testCase.label} pass confidence=${parsed.confidence} textLength=${text.length}`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
