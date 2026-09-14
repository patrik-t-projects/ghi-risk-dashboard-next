"use client";

export function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url;
});

export async function exportPlotsPng(elements: HTMLElement[], stationIds: string[], from: string, to: string) {
  if (!elements.length) throw new Error("Wait for the selected station plots to finish loading.");
  const { default: Plotly } = await import("plotly.js/dist/plotly-basic.min.js");
  const chartWidth = 900; const chartHeight = 480; const gap = 20; const heading = 38;
  const rows = stationIds.map(id => ({ id, charts: elements.filter(element => element.dataset.exportStation === id) }))
    .filter(row => row.charts.length);
  if (!rows.length) throw new Error("Wait for the selected station plots to finish loading.");
  const baseWidth = chartWidth * 2 + gap * 3;
  const baseHeight = gap + rows.length * (heading + chartHeight + gap);
  const scale = Math.min(1, 30000 / baseHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(baseWidth * scale); canvas.height = Math.round(baseHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create the PNG export.");
  context.scale(scale, scale); context.fillStyle = "#ffffff"; context.fillRect(0, 0, baseWidth, baseHeight);
  context.fillStyle = "#172033"; context.font = "600 24px Arial, sans-serif";
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]; const top = gap + rowIndex * (heading + chartHeight + gap);
    context.fillText(row.id, gap, top + 25);
    for (let chartIndex = 0; chartIndex < row.charts.length; chartIndex++) {
      const element = row.charts[chartIndex];
      const dataUrl = await Plotly.toImage(element, { format: "png", width: chartWidth, height: chartHeight });
      const image = await loadImage(dataUrl);
      const column = element.dataset.exportModel === "icon_ch2" ? 1 : Math.min(chartIndex, 1);
      context.drawImage(image, gap + column * (chartWidth + gap), top + heading, chartWidth, chartHeight);
    }
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("PNG creation failed.")), "image/png"));
  const period = from === to ? from : `${from}_to_${to}`;
  saveDownload(blob, `switzerland_forecast_plots_${period}.png`);
}
