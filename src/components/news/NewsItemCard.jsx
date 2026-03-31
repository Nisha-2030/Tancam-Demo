import { TrustScoreBadge } from "../common/TrustScoreBadge";

export function NewsItemCard({ item, compact = false, onSelect, selected = false }) {
  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
        selected ? "border-sky-400" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {item.source}
        </span>
        {item.published_at ? (
          <span className="text-xs text-slate-500">
            {new Date(item.published_at).toLocaleString()}
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 font-display text-lg font-semibold text-slate-900">{item.title}</h3>
      <p className="mt-2 text-sm text-slate-600">
        {item.description || item.content || "No summary available."}
      </p>

      <div className="mt-3">
        <TrustScoreBadge score={item.trustScore} />
      </div>

      {!compact && item.confidenceNote ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{item.confidenceNote}</p>
      ) : null}

      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          {selected ? "Selected" : "Use This Article"}
        </button>
      ) : null}
    </article>
  );
}
