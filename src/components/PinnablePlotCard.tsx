"use client";

import type { ReactNode } from "react";
import PinPlotButton from "./PinPlotButton";

export default function PinnablePlotCard({ children, header, onPin, pinned = false, tone = "dark", className = "" }: {
  children: ReactNode;
  header?: ReactNode;
  onPin?: () => void;
  pinned?: boolean;
  tone?: "dark" | "light";
  className?: string;
}) {
  const light = tone === "light";
  return <section className={`min-w-0 overflow-hidden rounded-2xl border ${light ? "border-slate-200 bg-white text-slate-800" : "border-white/10 bg-white/[0.025] text-slate-100"} ${className}`}>
    {(header || onPin) && <div className={`flex min-h-14 items-stretch gap-2 border-b ${light ? "border-slate-100" : "border-white/10"}`}>
      <div className="min-w-0 flex-1">{header}</div>
      {onPin && <div className="flex shrink-0 items-center py-2 pr-4"><PinPlotButton onClick={onPin} pinned={pinned} tone={tone} /></div>}
    </div>}
    {children}
  </section>;
}
