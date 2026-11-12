"use client";

import { useState } from "react";
import { addDashboardBox, assignDashboardWidget, boxPixelHeight, removeDashboardWidget,
  type CustomDashboardState, type DashboardBox, type DashboardBoxSize } from "@/lib/customDashboard";
import DashboardWidgetView from "./DashboardWidgets";

export default function CustomDashboard({ state, onSave }: { state: CustomDashboardState; onSave: (state: CustomDashboardState) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state);
  const shown = editing ? draft : state;
  function beginEdit() { setDraft(structuredClone(state)); setEditing(true); }
  function save() { onSave(draft); setEditing(false); }
  function updateBox(boxId: string, patch: Partial<DashboardBox>) {
    setDraft(current => ({ ...current, boxes: current.boxes.map(box => box.id === boxId ? { ...box, ...patch } : box) }));
  }
  function moveBox(index: number, offset: number) {
    setDraft(current => { const boxes = [...current.boxes]; const target = index + offset;
      if (target < 0 || target >= boxes.length) return current;
      [boxes[index], boxes[target]] = [boxes[target], boxes[index]]; return { ...current, boxes }; });
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
      <p className="text-sm text-slate-300">Assign pinned plots to boxes, then choose each box’s size and order.</p>
      <button type="button" onClick={() => setDraft(current => addDashboardBox(current))} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-sm text-cyan-200">Add box</button>
    </div>}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {shown.boxes.map((box, index) => {
        const widget = shown.widgets.find(item => item.id === box.widgetId);
        const height = boxPixelHeight[box.size];
        return <section key={box.id} style={editing ? { minHeight: height } : { height }} className={`${box.width === 2 ? "lg:col-span-2" : ""} overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]`}>
          {editing ? <div className="flex h-full min-h-[320px] flex-col p-4">
            <div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Box {index + 1}</span>
              <button type="button" disabled={draft.boxes.length === 1} onClick={() => setDraft(current => ({ ...current, boxes: current.boxes.filter(item => item.id !== box.id) }))}
                className="text-xs text-slate-400 hover:text-red-300 disabled:opacity-30">Remove box</button></div>
            <label className="text-xs text-slate-400">Pinned plot<select value={box.widgetId ?? ""} onChange={event => setDraft(current => assignDashboardWidget(current, box.id, event.target.value || null))}
              className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white"><option value="">Empty</option>
              {draft.widgets.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Width<select value={box.width} onChange={event => updateBox(box.id, { width: Number(event.target.value) as 1 | 2 })}
              className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white"><option value="1">Half</option><option value="2">Full</option></select></label>
              <label className="text-xs text-slate-400">Height<select value={box.size} onChange={event => updateBox(box.id, { size: event.target.value as DashboardBoxSize })}
                className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white"><option value="compact">Compact</option><option value="standard">Standard</option><option value="tall">Tall</option></select></label></div>
            <div className="mt-4 flex gap-2"><button type="button" disabled={index === 0} onClick={() => moveBox(index, -1)} className="rounded border border-white/15 px-3 py-1.5 text-xs disabled:opacity-30">Move earlier</button>
              <button type="button" disabled={index === shown.boxes.length - 1} onClick={() => moveBox(index, 1)} className="rounded border border-white/15 px-3 py-1.5 text-xs disabled:opacity-30">Move later</button></div>
            <div className="mt-auto pt-6 text-center text-sm text-slate-500">{widget ? widget.title : "No plot assigned"}</div>
            {widget && <button type="button" onClick={() => setDraft(current => removeDashboardWidget(current, widget.id))} className="mt-3 text-xs text-red-300">Unpin plot</button>}
          </div> : widget ? <DashboardWidgetView widget={widget} height={height - 2} />
            : <div className="grid h-full min-h-[320px] place-items-center p-6 text-center text-sm text-slate-500">Empty dashboard box<br />Use Edit Dashboard to assign a pinned plot.</div>}
        </section>;
      })}
    </div>
    {!editing && !state.widgets.length && <p className="mt-5 text-center text-sm text-slate-500">Pin a plot from CH Imbalance &amp; AEP or Switzerland map — Beta to add it here.</p>}
  </div>;
}
