"use client";

type ExportLegendItem = {
  label: string;
  color?: string;
  checked: boolean;
};

type ExportCard = {
  station: string;
  model: string;
  canvas: HTMLCanvasElement;
};

const CHART_WIDTH = 900;
const CHART_HEIGHT = 480;
const GAP = 20;
const STATION_HEADING = 38;

export function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = url;
});

function legendItems(element: HTMLElement): ExportLegendItem[] {
  try {
    const parsed = JSON.parse(element.dataset.exportLegend ?? "[]") as ExportLegendItem[];
    return parsed.filter(item => typeof item.label === "string" && typeof item.checked === "boolean");
  } catch {
    return [];
  }
}

function legendLayout(context: CanvasRenderingContext2D, items: ExportLegendItem[]) {
  const left = 20;
  const right = CHART_WIDTH - 20;
  const itemHeight = 26;
  let x = left;
  let y = 47;
  return {
    positions: items.map(item => {
      const lineWidth = item.color ? 26 : 0;
      const width = 17 + lineWidth + context.measureText(item.label).width + 22;
      if (x > left && x + width > right) {
        x = left;
        y += itemHeight;
      }
      const position = { item, x, y, width };
      x += width;
      return position;
    }),
    height: y + 22,
  };
}

async function renderChartCard(element: HTMLElement): Promise<ExportCard> {
  const { default: Plotly } = await import("plotly.js/dist/plotly-basic.min.js");
  const items = legendItems(element);
  const sizingCanvas = document.createElement("canvas");
  const sizingContext = sizingCanvas.getContext("2d");
  if (!sizingContext) throw new Error("This browser cannot create the chart export.");
  sizingContext.font = "12px Arial, sans-serif";
  const layout = legendLayout(sizingContext, items);

  const canvas = document.createElement("canvas");
  canvas.width = CHART_WIDTH;
  canvas.height = layout.height + CHART_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create the chart export.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#172033";
  context.font = "600 18px Arial, sans-serif";
  context.fillText(element.dataset.exportTitle ?? "GHI forecast", 20, 27);
  context.font = "12px Arial, sans-serif";

  for (const { item, x, y } of layout.positions) {
    context.strokeStyle = "#64748b";
    context.lineWidth = 1.2;
    context.strokeRect(x, y - 12, 12, 12);
    if (item.checked) {
      context.strokeStyle = "#2563eb";
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(x + 2.5, y - 6);
      context.lineTo(x + 5, y - 3);
      context.lineTo(x + 10, y - 10);
      context.stroke();
    }
    let labelX = x + 18;
    if (item.color) {
      context.strokeStyle = item.color;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(labelX, y - 6);
      context.lineTo(labelX + 18, y - 6);
      context.stroke();
      labelX += 26;
    }
    context.fillStyle = item.checked ? "#334155" : "#94a3b8";
    context.fillText(item.label, labelX, y - 1);
  }

  context.strokeStyle = "#e2e8f0";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, layout.height - 0.5);
  context.lineTo(CHART_WIDTH, layout.height - 0.5);
  context.stroke();

  const dataUrl = await Plotly.toImage(element, { format: "png", width: CHART_WIDTH, height: CHART_HEIGHT });
  const image = await loadImage(dataUrl);
  context.drawImage(image, 0, layout.height, CHART_WIDTH, CHART_HEIGHT);

  return {
    station: element.dataset.exportStation ?? "",
    model: element.dataset.exportModel ?? "",
    canvas,
  };
}

async function renderCards(elements: HTMLElement[], stationIds: string[]) {
  if (!elements.length) throw new Error("Wait for the selected station plots to finish loading.");
  const cards = await Promise.all(elements.map(renderChartCard));
  const rows = stationIds.map(id => ({ id, cards: cards.filter(card => card.station === id) }))
    .filter(row => row.cards.length);
  if (!rows.length) throw new Error("Wait for the selected station plots to finish loading.");
  return rows;
}

function rowHeight(cards: ExportCard[]) {
  return STATION_HEADING + Math.max(...cards.map(card => card.canvas.height));
}

function periodName(from: string, to: string) {
  return from === to ? from : `${from}_to_${to}`;
}

export async function exportPlotsPng(elements: HTMLElement[], stationIds: string[], from: string, to: string) {
  const rows = await renderCards(elements, stationIds);
  const baseWidth = CHART_WIDTH * 2 + GAP * 3;
  const baseHeight = GAP + rows.reduce((height, row) => height + rowHeight(row.cards) + GAP, 0);
  const scale = Math.min(1, 30000 / baseHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(baseWidth * scale);
  canvas.height = Math.round(baseHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create the PNG export.");
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, baseWidth, baseHeight);
  context.fillStyle = "#172033";
  context.font = "600 24px Arial, sans-serif";

  let top = GAP;
  for (const row of rows) {
    context.fillText(row.id, GAP, top + 25);
    for (let chartIndex = 0; chartIndex < row.cards.length; chartIndex++) {
      const card = row.cards[chartIndex];
      const column = card.model === "icon_ch2" ? 1 : Math.min(chartIndex, 1);
      context.drawImage(card.canvas, GAP + column * (CHART_WIDTH + GAP), top + STATION_HEADING);
    }
    top += rowHeight(row.cards) + GAP;
  }

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("PNG creation failed.")), "image/png"));
  saveDownload(blob, `switzerland_forecast_plots_${periodName(from, to)}.png`);
}

export async function exportPlotsPdf(elements: HTMLElement[], stationIds: string[], from: string, to: string) {
  const [{ jsPDF }, rows] = await Promise.all([
    import("jspdf"),
    renderCards(elements, stationIds),
  ]);
  const pageWidth = CHART_WIDTH * 2 + GAP * 3;
  const requestedHeight = GAP + rows.reduce((height, row) => height + rowHeight(row.cards) + GAP, 0);
  const maxPageHeight = 14000;
  const firstPageHeight = Math.min(requestedHeight, maxPageHeight);
  const pdf = new jsPDF({
    unit: "px",
    format: [pageWidth, firstPageHeight],
    orientation: firstPageHeight >= pageWidth ? "portrait" : "landscape",
    hotfixes: ["px_scaling"],
  });

  pdf.setTextColor(23, 32, 51);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  let top = GAP;
  let pageHeight = firstPageHeight;
  for (const row of rows) {
    const height = rowHeight(row.cards) + GAP;
    if (top > GAP && top + height > pageHeight) {
      const remainingHeight = Math.min(maxPageHeight, GAP + height);
      pdf.addPage([pageWidth, remainingHeight], remainingHeight >= pageWidth ? "portrait" : "landscape");
      pageHeight = remainingHeight;
      top = GAP;
    }
    pdf.text(row.id, GAP, top + 25);
    for (let chartIndex = 0; chartIndex < row.cards.length; chartIndex++) {
      const card = row.cards[chartIndex];
      const column = card.model === "icon_ch2" ? 1 : Math.min(chartIndex, 1);
      pdf.addImage(card.canvas.toDataURL("image/png"), "PNG", GAP + column * (CHART_WIDTH + GAP), top + STATION_HEADING, CHART_WIDTH, card.canvas.height);
    }
    top += height;
  }
  pdf.save(`switzerland_forecast_plots_${periodName(from, to)}.pdf`);
}
