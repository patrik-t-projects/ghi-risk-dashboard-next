import type { StationSummary } from "./forecastCsv";

export type DashboardBoxSize = "compact" | "standard" | "tall";
export type DashboardBox = { id: string; widgetId: string | null; width: 1 | 2; size: DashboardBoxSize };
type PeriodConfig = { mode: "today" | "history"; from: string; to: string };
export type DashboardWidget =
  | ({ id: string; kind: "ghi"; title: string; station: StationSummary; model: "icon_ch1" | "icon_ch2" } & PeriodConfig)
  | ({ id: string; kind: "balance"; title: string } & PeriodConfig)
  | { id: "imbalance-html"; kind: "imbalance-html"; title: string };
export type CustomDashboardState = { version: 1; boxes: DashboardBox[]; widgets: DashboardWidget[] };

export const boxPixelHeight: Record<DashboardBoxSize, number> = { compact: 420, standard: 600, tall: 780 };

export function defaultCustomDashboard(): CustomDashboardState {
  return { version: 1, widgets: [], boxes: Array.from({ length: 4 }, (_, index) => ({
    id: `box-${index + 1}`, widgetId: null, width: 1, size: "standard",
  })) };
}

export function createGhiWidget(station: StationSummary, model: "icon_ch1" | "icon_ch2", mode: "today" | "history",
  from: string, to: string): DashboardWidget {
  const period = mode === "today" ? "today" : `${from}:${to}`;
  return { id: `ghi:${station.id}:${model}:${period}`, kind: "ghi",
    title: `${station.id} · ${model === "icon_ch1" ? "ICON1" : "ICON2"} GHI`, station, model, mode, from, to };
}

export function createBalanceWidget(mode: "today" | "history", from: string, to: string): DashboardWidget {
  const period = mode === "today" ? "today" : `${from}:${to}`;
  return { id: `balance:${period}`, kind: "balance", title: "CH Imbalance & AEP", mode, from, to };
}

export const imbalanceHtmlWidget: DashboardWidget = {
  id: "imbalance-html", kind: "imbalance-html", title: "Imbalance forecast",
};

export function pinDashboardWidget(state: CustomDashboardState, widget: DashboardWidget): CustomDashboardState {
  if (state.widgets.some(existing => existing.id === widget.id)) return state;
  const widgets = [...state.widgets, widget];
  const empty = state.boxes.findIndex(box => !box.widgetId);
  if (empty >= 0) return { ...state, widgets, boxes: state.boxes.map((box, index) => index === empty ? { ...box, widgetId: widget.id } : box) };
  return { ...state, widgets, boxes: [...state.boxes, {
    id: nextBoxId(state.boxes), widgetId: widget.id, width: 1, size: "standard",
  }] };
}

export function assignDashboardWidget(state: CustomDashboardState, boxId: string, widgetId: string | null): CustomDashboardState {
  return { ...state, boxes: state.boxes.map(box => box.id === boxId ? { ...box, widgetId }
    : widgetId && box.widgetId === widgetId ? { ...box, widgetId: null } : box) };
}

export function removeDashboardWidget(state: CustomDashboardState, widgetId: string): CustomDashboardState {
  return { ...state, widgets: state.widgets.filter(widget => widget.id !== widgetId),
    boxes: state.boxes.map(box => box.widgetId === widgetId ? { ...box, widgetId: null } : box) };
}

export function addDashboardBox(state: CustomDashboardState): CustomDashboardState {
  return { ...state, boxes: [...state.boxes, { id: nextBoxId(state.boxes), widgetId: null, width: 1, size: "standard" }] };
}

export function normalizeCustomDashboard(value: unknown): CustomDashboardState {
  if (!value || typeof value !== "object") return defaultCustomDashboard();
  const candidate = value as Partial<CustomDashboardState>;
  if (candidate.version !== 1 || !Array.isArray(candidate.boxes) || !Array.isArray(candidate.widgets)) return defaultCustomDashboard();
  const widgets = candidate.widgets.filter(validWidget);
  const widgetIds = new Set(widgets.map(widget => widget.id));
  const boxes = candidate.boxes.flatMap((box, index) => {
    if (!box || typeof box !== "object") return [];
    const item = box as Partial<DashboardBox>;
    const size: DashboardBoxSize = item.size === "compact" || item.size === "tall" ? item.size : "standard";
    return [{ id: typeof item.id === "string" ? item.id : `box-${index + 1}`,
      widgetId: typeof item.widgetId === "string" && widgetIds.has(item.widgetId) ? item.widgetId : null,
      width: item.width === 2 ? 2 as const : 1 as const, size }];
  });
  return { version: 1, widgets, boxes: boxes.length ? boxes : defaultCustomDashboard().boxes };
}

function nextBoxId(boxes: DashboardBox[]): string {
  let index = boxes.length + 1;
  while (boxes.some(box => box.id === `box-${index}`)) index++;
  return `box-${index}`;
}

function validWidget(value: unknown): value is DashboardWidget {
  if (!value || typeof value !== "object") return false;
  const widget = value as Partial<DashboardWidget>;
  if (typeof widget.id !== "string" || typeof widget.title !== "string") return false;
  if (widget.kind === "imbalance-html") return widget.id === "imbalance-html";
  if (widget.kind === "balance") return validPeriod(widget);
  return widget.kind === "ghi" && validPeriod(widget) && Boolean(widget.station && typeof widget.station.id === "string") &&
    (widget.model === "icon_ch1" || widget.model === "icon_ch2");
}

function validPeriod(value: { mode?: unknown; from?: unknown; to?: unknown }): boolean {
  return (value.mode === "today" || value.mode === "history") && typeof value.from === "string" && typeof value.to === "string";
}
