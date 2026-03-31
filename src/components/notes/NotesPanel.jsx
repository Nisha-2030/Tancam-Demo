export function NotesPanel({ notes, points }) {
  if (!notes && (!points || !points.length)) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-display text-lg font-semibold text-slate-900">Generated Notes</h3>
      {points?.length ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{notes}</p>
      )}
    </section>
  );
}
