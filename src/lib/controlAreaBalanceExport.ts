"use client";

import type { ControlAreaBalanceRow } from "./controlAreaBalanceCsv";
import { saveDownload } from "./forecastExport";

const EXPORT_WIDTH = 1200;
const EXPORT_HEIGHT = 650;

function periodName(from: string, to: string) {
  return from === to ? from : `${from}_to_${to}`;
}

function swissgridTimestamp(value: string) {
  const instant = new Date(value);
  const two = (number: number) => String(number).padStart(2, "0");
  return `${two(instant.getUTCDate())}.${two(instant.getUTCMonth() + 1)}.${instant.getUTCFullYear()} ${two(instant.getUTCHours())}:${two(instant.getUTCMinutes())}`;
}

export function controlAreaBalanceCsv(rows: ControlAreaBalanceRow[]) {
  const records = rows.map(row => [
    swissgridTimestamp(row.time),
    row.imbalance ?? "",
    row.aep ?? "",
  ].join(";"));
  return ["Date Time [UTC];Total System Imbalance;AEP EUR/MWh", ...records].join("\r\n") + "\r\n";
}

export function exportControlAreaBalanceCsv(rows: ControlAreaBalanceRow[], from: string, to: string) {
  saveDownload(new Blob([controlAreaBalanceCsv(rows)], { type: "text/csv;charset=utf-8" }),
    `ch_imbalance_aep_${periodName(from, to)}.csv`);
}

async function plotImage(element: HTMLElement) {
  const { default: Plotly } = await import("plotly.js/dist/plotly-basic.min.js");
  return Plotly.toImage(element, { format: "png", width: EXPORT_WIDTH, height: EXPORT_HEIGHT, scale: 2 });
}

export async function exportControlAreaBalancePng(element: HTMLElement, from: string, to: string) {
  const response = await fetch(await plotImage(element));
  saveDownload(await response.blob(), `ch_imbalance_aep_${periodName(from, to)}.png`);
}

export async function exportControlAreaBalancePdf(element: HTMLElement, from: string, to: string) {
  const [{ jsPDF }, image] = await Promise.all([import("jspdf"), plotImage(element)]);
  const pdf = new jsPDF({ unit: "px", format: [EXPORT_WIDTH, EXPORT_HEIGHT], orientation: "landscape", hotfixes: ["px_scaling"] });
  pdf.addImage(image, "PNG", 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  pdf.save(`ch_imbalance_aep_${periodName(from, to)}.pdf`);
}
