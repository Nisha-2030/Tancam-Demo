export function PageHeader({ title, description, actions }) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 md:text-base">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
