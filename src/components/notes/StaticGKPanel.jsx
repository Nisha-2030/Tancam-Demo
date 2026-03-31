export function StaticGKPanel({ topicMatches }) {
  if (!topicMatches?.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-display text-lg font-semibold text-slate-900">Linked Static GK</h3>
        <p className="mt-2 text-sm text-slate-600">
          Static GK is not generated for this item yet. Regenerate this news in admin panel to load GK facts.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-display text-lg font-semibold text-slate-900">Linked Static GK</h3>

      <div className="mt-3 space-y-3">
        {topicMatches.map((topic) => (
          <article key={topic.topic_id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{topic.topic_name}</p>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {Math.round(topic.confidence * 100)}% match
              </span>
            </div>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{topic.category}</p>

            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {topic.facts.map((fact) => (
                <li key={`${topic.topic_id}-${fact.key}`} className="flex gap-2">
                  <span className="min-w-28 font-semibold text-slate-900">{fact.key}:</span>
                  <span>{fact.value}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
