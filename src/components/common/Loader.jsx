export function Loader({ text = "Loading..." }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      <span>{text}</span>
    </div>
  );
}
