import type { StationSummary } from "./forecastCsv";

export const DASHBOARD_CANVAS_WIDTH = 1200;
export const MIN_DASHBOARD_BOX_WIDTH = 300;
export const MIN_DASHBOARD_BOX_HEIGHT = 400;
const DEFAULT_BOX_WIDTH = 590;
const DEFAULT_BOX_HEIGHT = 520;
const DEFAULT_GAP = 20;

export type DashboardBox = {
  id: string;
  widgetId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
};
type PeriodConfig = { mode: "today" | "history"; from: string; to: string };
export type DashboardWidget =
  | ({ id: string; kind: "ghi"; title: string; station: StationSummary; model: "icon_ch1" | "icon_ch2" } & PeriodConfig)
  | ({ id: string; kind: "balance"; title: string } & PeriodConfig)
  | { id: "imbalance-html"; kind: "imbalance-html"; title: string };
export type CustomDashboardState = { version: 2; boxes: DashboardBox[]; widgets: DashboardWidget[] };

export function defaultCustomDashboard(): CustomDashboardState {
  return {
    version: 2,
    widgets: [],
    boxes: Array.from({ length: 4 }, (_, index) => ({
      id: `box-${index + 1}`,
      widgetId: null,
      x: index % 2 === 0 ? 0 : DEFAULT_BOX_WIDTH + DEFAULT_GAP,
      y: index < 2 ? 0 : DEFAULT_BOX_HEIGHT + DEFAULT_GAP,
      width: DEFAULT_BOX_WIDTH,
      height: DEFAULT_BOX_HEIGHT,
    })),
  };
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

export function boxesOverlap(first: DashboardBox, second: DashboardBox): boolean {
  return first.x < second.x + second.width && first.x + first.width > second.x &&
    first.y < second.y + second.height && first.y + first.height > second.y;
}

export function canPlaceDashboardBox(box: DashboardBox, boxes: DashboardBox[], ignoredIds: string[] = [box.id]): boolean {
  if (box.x < 0 || box.y < 0 || box.width < MIN_DASHBOARD_BOX_WIDTH || box.height < MIN_DASHBOARD_BOX_HEIGHT ||
      box.x + box.width > DASHBOARD_CANVAS_WIDTH) return false;
  return boxes.every(other => ignoredIds.includes(other.id) || !boxesOverlap(box, other));
}

export function updateDashboardBoxLayout(state: CustomDashboardState, boxId: string,
  layout: Pick<DashboardBox, "x" | "y" | "width" | "height">): CustomDashboardState {
  const current = state.boxes.find(box => box.id === boxId);
  if (!current) return state;
  const candidate = { ...current, ...layout };
  if (!canPlaceDashboardBox(candidate, state.boxes)) return state;
  return { ...state, boxes: state.boxes.map(box => box.id === boxId ? candidate : box) };
}

export function swapDashboardBoxPositions(state: CustomDashboardState, firstId: string, secondId: string): CustomDashboardState {
  if (firstId === secondId) return state;
  const first = state.boxes.find(box => box.id === firstId);
  const second = state.boxes.find(box => box.id === secondId);
  if (!first || !second) return state;
  const movedFirst = { ...first, x: second.x, y: second.y };
  const movedSecond = { ...second, x: first.x, y: first.y };
  const ignored = [firstId, secondId];
  if (!canPlaceDashboardBox(movedFirst, state.boxes, ignored) || !canPlaceDashboardBox(movedSecond, state.boxes, ignored) ||
      boxesOverlap(movedFirst, movedSecond)) return state;
  return { ...state, boxes: state.boxes.map(box => box.id === firstId ? movedFirst : box.id === secondId ? movedSecond : box) };
}

export function pinDashboardWidget(state: CustomDashboardState, widget: DashboardWidget): CustomDashboardState {
  if (state.widgets.some(existing => existing.id === widget.id)) return state;
  const widgets = [...state.widgets, widget];
  const empty = state.boxes.findIndex(box => !box.widgetId);
  if (empty >= 0) return { ...state, widgets, boxes: state.boxes.map((box, index) => index === empty ? { ...box, widgetId: widget.id } : box) };
  return addDashboardBox({ ...state, widgets }, widget.id);
}

export function assignDashboardWidget(state: CustomDashboardState, boxId: string, widgetId: string | null): CustomDashboardState {
  return { ...state, boxes: state.boxes.map(box => box.id === boxId ? { ...box, widgetId }
    : widgetId && box.widgetId === widgetId ? { ...box, widgetId: null } : box) };
}

export function removeDashboardWidget(state: CustomDashboardState, widgetId: string): CustomDashboardState {
  return { ...state, widgets: state.widgets.filter(widget => widget.id !== widgetId),
    boxes: state.boxes.map(box => box.widgetId === widgetId ? { ...box, widgetId: null } : box) };
}

export function addDashboardBox(state: CustomDashboardState, widgetId: string | null = null): CustomDashboardState {
  const position = findOpenPosition(state.boxes, DEFAULT_BOX_WIDTH, DEFAULT_BOX_HEIGHT);
  return { ...state, boxes: [...state.boxes, { id: nextBoxId(state.boxes), widgetId, ...position,
    width: DEFAULT_BOX_WIDTH, height: DEFAULT_BOX_HEIGHT }] };
}

export function normalizeCustomDashboard(value: unknown): CustomDashboardState {
  if (!value || typeof value !== "object") return defaultCustomDashboard();
  const candidate = value as { version?: unknown; boxes?: unknown; widgets?: unknown };
  if (!Array.isArray(candidate.boxes) || !Array.isArray(candidate.widgets)) return defaultCustomDashboard();
  const widgets = candidate.widgets.filter(validWidget);
  const widgetIds = new Set(widgets.map(widget => widget.id));
  const boxes = candidate.version === 2
    ? normalizeFreeBoxes(candidate.boxes, widgetIds)
    : normalizeLegacyBoxes(candidate.boxes, widgetIds);
  return { version: 2, widgets, boxes: boxes.length ? boxes : defaultCustomDashboard().boxes };
}

function normalizeFreeBoxes(values: unknown[], widgetIds: Set<string>): DashboardBox[] {
  const boxes: DashboardBox[] = [];
  values.forEach((value, index) => {
    if (!value || typeof value !== "object") return;
    const item = value as Partial<DashboardBox>;
    const width = clampNumber(item.width, MIN_DASHBOARD_BOX_WIDTH, DASHBOARD_CANVAS_WIDTH, DEFAULT_BOX_WIDTH);
    const height = clampNumber(item.height, MIN_DASHBOARD_BOX_HEIGHT, 2400, DEFAULT_BOX_HEIGHT);
    const proposed: DashboardBox = {
      id: typeof item.id === "string" ? item.id : `box-${index + 1}`,
      widgetId: typeof item.widgetId === "string" && widgetIds.has(item.widgetId) ? item.widgetId : null,
      x: clampNumber(item.x, 0, DASHBOARD_CANVAS_WIDTH - width, 0),
      y: clampNumber(item.y, 0, 10000, 0), width, height,
    };
    boxes.push(canPlaceDashboardBox(proposed, boxes, []) ? proposed : { ...proposed, ...findOpenPosition(boxes, width, height) });
  });
  return boxes;
}

function normalizeLegacyBoxes(values: unknown[], widgetIds: Set<string>): DashboardBox[] {
  const boxes: DashboardBox[] = [];
  values.forEach((value, index) => {
    if (!value || typeof value !== "object") return;
    const item = value as { id?: unknown; widgetId?: unknown; width?: unknown; size?: unknown };
    const width = item.width === 2 ? DASHBOARD_CANVAS_WIDTH : DEFAULT_BOX_WIDTH;
    const height = item.size === "compact" ? 420 : item.size === "tall" ? 780 : 600;
    boxes.push({ id: typeof item.id === "string" ? item.id : `box-${index + 1}`,
      widgetId: typeof item.widgetId === "string" && widgetIds.has(item.widgetId) ? item.widgetId : null,
      ...findOpenPosition(boxes, width, height), width, height });
  });
  return boxes;
}

function findOpenPosition(boxes: DashboardBox[], width: number, height: number): Pick<DashboardBox, "x" | "y"> {
  const bottom = boxes.reduce((maximum, box) => Math.max(maximum, box.y + box.height), 0);
  for (let y = 0; y <= bottom + DEFAULT_GAP; y += DEFAULT_GAP) {
    for (let x = 0; x <= DASHBOARD_CANVAS_WIDTH - width; x += DEFAULT_GAP) {
      const candidate: DashboardBox = { id: "__candidate__", widgetId: null, x, y, width, height };
      if (canPlaceDashboardBox(candidate, boxes, [])) return { x, y };
    }
  }
  return { x: 0, y: bottom + DEFAULT_GAP };
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
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
