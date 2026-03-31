import { getTrustMeta } from "../../utils/trust";

const toneStyles = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
};

export function TrustScoreBadge({ score }) {
  const trustMeta = getTrustMeta(score);
  const toneClass = toneStyles[trustMeta.tone] || toneStyles.slate;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
        Trust Score: {Number.isFinite(score) ? score : "NA"}
      </span>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
        {trustMeta.label}
      </span>
    </div>
  );
}
