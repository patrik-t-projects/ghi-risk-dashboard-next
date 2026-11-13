"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { addDashboardBox, assignDashboardWidget, canPlaceDashboardBox, DASHBOARD_CANVAS_WIDTH,
  MIN_DASHBOARD_BOX_HEIGHT, MIN_DASHBOARD_BOX_WIDTH, removeDashboardWidget, swapDashboardBoxPositions,
  updateDashboardBoxLayout, type CustomDashboardState, type DashboardBox } from "@/lib/customDashboard";
import DashboardWidgetView from "./DashboardWidgets";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Interaction = {
  pointerId: number;
  boxId: string;
  kind: "move" | "resize";
  edge?: ResizeEdge;
  startClientX: number;
  startClientY: number;
  startBox: DashboardBox;
  horizontalScale: number;
};

const resizeHandles: { edge: ResizeEdge; className: string; markerClass: string; cursor: string }[] = [
  { edge: "n", className: "left-3 right-3 top-0 h-3", markerClass: "left-1/2 top-0 h-2 w-8 -translate-x-1/2", cursor: "ns-resize" },
  { edge: "s", className: "bottom-0 left-3 right-3 h-3", markerClass: "bottom-0 left-1/2 h-2 w-8 -translate-x-1/2", cursor: "ns-resize" },
  { edge: "e", className: "bottom-3 right-0 top-3 w-3", markerClass: "right-0 top-1/2 h-8 w-2 -translate-y-1/2", cursor: "ew-resize" },
  { edge: "w", className: "bottom-3 left-0 top-3 w-3", markerClass: "left-0 top-1/2 h-8 w-2 -translate-y-1/2", cursor: "ew-resize" },
  { edge: "ne", className: "right-0 top-0 h-4 w-4", markerClass: "right-0 top-0 h-3 w-3", cursor: "nesw-resize" },
  { edge: "nw", className: "left-0 top-0 h-4 w-4", markerClass: "left-0 top-0 h-3 w-3", cursor: "nwse-resize" },
  { edge: "se", className: "bottom-0 right-0 h-4 w-4", markerClass: "bottom-0 right-0 h-3 w-3", cursor: "nwse-resize" },
  { edge: "sw", className: "bottom-0 left-0 h-4 w-4", markerClass: "bottom-0 left-0 h-3 w-3", cursor: "nesw-resize" },
];

export default function CustomDashboard({ state, onSave }: { state: CustomDashboardState; onSave: (state: CustomDashboardState) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const swapTargetRef = useRef<string | null>(null);
  const shown = editing ? draft : state;
  const canvasHeight = Math.max(760, ...shown.boxes.map(box => box.y + box.height + 32));

  function beginEdit() {
    setDraft(structuredClone(state));
    setEditing(true);
  }
  function save() {
    onSave(draft);
    setEditing(false);
    setActiveBoxId(null);
  }
  function startMove(event: ReactPointerEvent<HTMLElement>, box: DashboardBox) {
    if (!editing || (event.target as HTMLElement).closest("button, select, input, option, a, label, [data-no-drag]")) return;
    beginInteraction(event, box, "move");
  }
  function startResize(event: ReactPointerEvent<HTMLElement>, box: DashboardBox, edge: ResizeEdge) {
    event.preventDefault();
    event.stopPropagation();
    beginInteraction(event, box, "resize", edge);
  }
  function beginInteraction(event: ReactPointerEvent<HTMLElement>, box: DashboardBox, kind: Interaction["kind"], edge?: ResizeEdge) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = { pointerId: event.pointerId, boxId: box.id, kind, edge,
      startClientX: event.clientX, startClientY: event.clientY, startBox: box,
      horizontalScale: DASHBOARD_CANVAS_WIDTH / bounds.width };
    setActiveBoxId(box.id);
  }
  function moveInteraction(event: ReactPointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !canvas) return;
    event.preventDefault();
    const dx = (event.clientX - interaction.startClientX) * interaction.horizontalScale;
    const dy = event.clientY - interaction.startClientY;
    const candidate = resizedBox(interaction, dx, dy);
    if (interaction.kind === "move") {
      const bounds = canvas.getBoundingClientRect();
      const pointerX = (event.clientX - bounds.left) * interaction.horizontalScale;
      const pointerY = event.clientY - bounds.top;
      const target = draft.boxes.find(box => box.id !== interaction.boxId && pointerX >= box.x && pointerX <= box.x + box.width &&
        pointerY >= box.y && pointerY <= box.y + box.height)?.id ?? null;
      swapTargetRef.current = target;
      setSwapTargetId(target);
    }
    setDraft(current => canPlaceDashboardBox(candidate, current.boxes)
      ? updateDashboardBoxLayout(current, interaction.boxId, candidate)
      : current);
  }
  function finishInteraction(event: ReactPointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "move" && swapTargetRef.current) {
      setDraft(current => {
        const restored = updateDashboardBoxLayout(current, interaction.boxId, interaction.startBox);
        const swapped = swapDashboardBoxPositions(restored, interaction.boxId, swapTargetRef.current!);
        return swapped === restored ? current : swapped;
      });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    interactionRef.current = null;
    swapTargetRef.current = null;
    setSwapTargetId(null);
    setActiveBoxId(null);
  }

  return <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400">Personal workspace</p>
      <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
      <p className="mt-2 text-sm text-slate-400">Live plots pinned from the model tabs.</p></div>
      <div className="flex gap-2">{editing ? <><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300">Cancel</button>
        <button type="button" onClick={save} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Save layout</button></>
        : <button type="button" onClick={beginEdit} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5">Edit Dashboard</button>}</div>
    </div>
    {editing && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
      <p className="text-sm text-slate-300">Drag any free area of a box to move it. Drag an edge or corner to resize. Boxes cannot overlap.</p>
      <button type="button" onClick={() => setDraft(current => addDashboardBox(current))} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-sm text-cyan-200">Add box</button>
    </div>}
    <div className="overflow-x-auto pb-4">
      <div ref={canvasRef} data-dashboard-canvas style={{ height: canvasHeight, minWidth: 900,
        backgroundImage: editing ? "radial-gradient(circle, rgba(148,163,184,.22) 1px, transparent 1px)" : undefined,
        backgroundSize: editing ? "20px 20px" : undefined }} className="relative w-full rounded-2xl">
        {shown.boxes.map((box, index) => {
          const widget = shown.widgets.find(item => item.id === box.widgetId);
          const active = activeBoxId === box.id;
          const swapTarget = swapTargetId === box.id;
          return <section key={box.id} onPointerDown={event => startMove(event, box)} onPointerMove={moveInteraction}
            onPointerUp={finishInteraction} onPointerCancel={finishInteraction}
            style={{ left: `${box.x / DASHBOARD_CANVAS_WIDTH * 100}%`, top: box.y,
              width: `${box.width / DASHBOARD_CANVAS_WIDTH * 100}%`, height: box.height,
              touchAction: editing ? "none" : undefined }}
            className={`absolute overflow-hidden rounded-2xl border bg-[#0b1824] ${editing ? "cursor-move select-none" : ""} ${active ? "z-20 border-cyan-300 shadow-[0_0_0_2px_rgba(34,211,238,.2)]" : swapTarget ? "z-10 border-amber-300 shadow-[0_0_0_2px_rgba(252,211,77,.2)]" : "border-white/10"}`}>
            {editing ? <div className="flex h-full flex-col p-4">
              <div className="mb-4 flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Box {index + 1} · drag to move</span>
                <button type="button" disabled={draft.boxes.length === 1} onClick={() => setDraft(current => ({ ...current, boxes: current.boxes.filter(item => item.id !== box.id) }))}
                  className="text-xs text-slate-400 hover:text-red-300 disabled:opacity-30">Remove box</button></div>
              <label className="text-xs text-slate-400">Pinned plot<select value={box.widgetId ?? ""} onChange={event => setDraft(current => assignDashboardWidget(current, box.id, event.target.value || null))}
                className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white"><option value="">Empty</option>
                {draft.widgets.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              <div className="mt-auto pt-6 text-center text-sm text-slate-500">{widget ? widget.title : "No plot assigned"}</div>
              {widget && <button type="button" onClick={() => setDraft(current => removeDashboardWidget(current, widget.id))} className="mt-3 text-xs text-red-300">Unpin plot</button>}
              {resizeHandles.map(handle => <span key={handle.edge} data-no-drag role="presentation"
                onPointerDown={event => startResize(event, box, handle.edge)} onPointerMove={moveInteraction}
                onPointerUp={finishInteraction} onPointerCancel={finishInteraction}
                style={{ cursor: handle.cursor }} className={`absolute ${handle.className}`}>
                <span className={`pointer-events-none absolute rounded-sm border border-cyan-200/70 bg-[#0b1824] ${handle.markerClass}`} />
              </span>)}
            </div> : widget ? <DashboardWidgetView widget={widget} height={box.height - 2} />
              : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-500">Empty dashboard box<br />Use Edit Dashboard to assign a pinned plot.</div>}
          </section>;
        })}
      </div>
    </div>
    {!editing && !state.widgets.length && <p className="mt-5 text-center text-sm text-slate-500">Pin a plot from CH Imbalance &amp; AEP or Switzerland map — Beta to add it here.</p>}
  </div>;
}

function resizedBox(interaction: Interaction, dx: number, dy: number): DashboardBox {
  const box = { ...interaction.startBox };
  if (interaction.kind === "move") {
    box.x = Math.round(Math.min(DASHBOARD_CANVAS_WIDTH - box.width, Math.max(0, box.x + dx)));
    box.y = Math.round(Math.max(0, box.y + dy));
    return box;
  }
  const edge = interaction.edge ?? "se";
  if (edge.includes("e")) box.width = Math.round(Math.min(DASHBOARD_CANVAS_WIDTH - box.x, Math.max(MIN_DASHBOARD_BOX_WIDTH, box.width + dx)));
  if (edge.includes("s")) box.height = Math.round(Math.max(MIN_DASHBOARD_BOX_HEIGHT, box.height + dy));
  if (edge.includes("w")) {
    const nextX = Math.round(Math.min(box.x + box.width - MIN_DASHBOARD_BOX_WIDTH, Math.max(0, box.x + dx)));
    box.width += box.x - nextX;
    box.x = nextX;
  }
  if (edge.includes("n")) {
    const nextY = Math.round(Math.min(box.y + box.height - MIN_DASHBOARD_BOX_HEIGHT, Math.max(0, box.y + dy)));
    box.height += box.y - nextY;
    box.y = nextY;
  }
  return box;
}
