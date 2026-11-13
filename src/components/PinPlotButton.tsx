"use client";

export default function PinPlotButton({ onClick, pinned = false, tone = "dark", className = "" }: {
  onClick: () => void;
  pinned?: boolean;
  tone?: "dark" | "light";
  className?: string;
}) {
  const colors = tone === "light"
    ? "border-slate-300 text-slate-600 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
    : "border-white/15 text-slate-300 hover:bg-white/5 disabled:text-slate-500";
  return <button type="button" onClick={onClick} disabled={pinned} aria-pressed={pinned}
    title={pinned ? "This plot is already pinned" : "Pin this plot to the personal dashboard"}
    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-default ${colors} ${className}`}>
    <svg viewBox="0 0 24 24" width="14" height="14" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h6l-.7 5.1 3.2 3.2v1.4h-11v-1.4l3.2-3.2L9 3Z" />
      <path d="M12 12.7V21" />
    </svg>
    Pin plot to dashboard
  </button>;
}
