import { useState } from "react";

import { ErrorAlert } from "../components/common/ErrorAlert";
import { Loader } from "../components/common/Loader";
import { PageHeader } from "../components/common/PageHeader";
import { NewsItemCard } from "../components/news/NewsItemCard";
import { useNewsContext } from "../context/NewsContext";

export function NewsListPage() {
  const {
    newsItems,
    selectedArticleId,
    setSelectedArticleId,
    loading,
    statusMessage,
    error,
    pipelineStats,
    lastQuery,
    runPipeline,
    refreshTrustScores,
  } = useNewsContext();

  const [query, setQuery] = useState(lastQuery || "isro");
  const [limit, setLimit] = useState(10);
  const [keywords, setKeywords] = useState("policy,economy,governance,science");
  const [excludedKeywords, setExcludedKeywords] = useState("celebrity,gossip,box office");

  const handleFetch = async (event) => {
    event.preventDefault();
    await runPipeline(query, Number(limit), {
      keywords: keywords
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      excludedKeywords: excludedKeywords
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      useLlm: true,
    });
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="News List"
        description="Fetch latest news from backend APIs and display AI-assigned trust score."
      />

      <form
        onSubmit={handleFetch}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-panel backdrop-blur md:grid-cols-2"
      >
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search query (e.g., isro, budget, rbi)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
          required
        />
        <input
          type="number"
          min={1}
          max={50}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
        />
        <input
          type="text"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="Include keywords (comma separated)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
        />
        <input
          type="text"
          value={excludedKeywords}
          onChange={(event) => setExcludedKeywords(event.target.value)}
          placeholder="Exclude keywords (comma separated)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            Run Full Pipeline
          </button>
          <button
            type="button"
            onClick={refreshTrustScores}
            disabled={loading || !newsItems.length}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Refresh Trust
          </button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          Fetched: <strong>{pipelineStats.fetched}</strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          AI Filtered: <strong>{pipelineStats.filtered}</strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          Trust Scored: <strong>{pipelineStats.trusted}</strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          Stage: <strong>{pipelineStats.stage}</strong>
        </div>
      </div>

      {loading ? <Loader text={statusMessage || "Running pipeline..."} /> : null}
      <ErrorAlert message={error} />

      <section className="grid gap-3">
        {newsItems.map((item) => (
          <NewsItemCard
            key={item.id}
            item={item}
            selected={selectedArticleId === item.id}
            onSelect={setSelectedArticleId}
          />
        ))}
        {!newsItems.length && !loading ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            No news loaded yet. Use the form above to fetch from backend.
          </p>
        ) : null}
      </section>
    </section>
  );
}
