"use client";
import { invoiceButtonClass } from "@/lib/invoiceUi";
export function PrintButton() { return <button type="button" className={`${invoiceButtonClass} print:hidden`} onClick={() => window.print()}>Cetak</button>; }
