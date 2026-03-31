import { useEffect, useMemo } from "react";

import { ErrorAlert } from "../components/common/ErrorAlert";
import { Loader } from "../components/common/Loader";
import { PageHeader } from "../components/common/PageHeader";
import { StatCard } from "../components/common/StatCard";
import { NewsItemCard } from "../components/news/NewsItemCard";
import { useNewsContext } from "../context/NewsContext";

export function DashboardPage() {
  const {
    newsItems,
    loading,
    statusMessage,
    error,
    lastQuery,
    loadNews,
    pipelineStats,
    selectedArticleId,
    setSelectedArticleId,
  } = useNewsContext();

  useEffect(() => {
    if (!newsItems.length) {
      loadNews(lastQuery || "isro", 8);
    }
  }, [lastQuery, loadNews, newsItems.length]);

  const summary = useMemo(() => {
    const high = newsItems.filter((item) => item.trustScore >= 100).length;
    const medium = newsItems.filter((item) => item.trustScore >= 80 && item.trustScore < 100).length;
    const low = newsItems.filter((item) => item.trustScore > 0 && item.trustScore < 80).length;
    const avg =
      newsItems.length > 0
        ? Math.round(newsItems.reduce((acc, item) => acc + (item.trustScore || 0), 0) / newsItems.length)
        : 0;

    return { high, medium, low, avg };
  }, [newsItems]);

  return (
    <section className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Track pipeline health, trust distribution, and most recent processed news."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Articles" value={newsItems.length} />
        <StatCard label="Average Trust" value={`${summary.avg}%`} />
        <StatCard label="100% (PIB)" value={summary.high} />
        <StatCard label="80% (Review)" value={summary.medium} />
        <StatCard label="60% (Low Trust)" value={summary.low} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fetched" value={pipelineStats.fetched} />
        <StatCard label="AI Filtered" value={pipelineStats.filtered} />
        <StatCard label="Trust Scored" value={pipelineStats.trusted} />
        <StatCard label="Pipeline Stage" value={pipelineStats.stage} />
      </div>

      {loading ? <Loader text={statusMessage || "Loading dashboard data..."} /> : null}
      <ErrorAlert message={error} />

      <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-panel backdrop-blur">
        <h2 className="font-display text-xl font-semibold text-slate-900">Recent News</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {newsItems.slice(0, 4).map((item) => (
            <NewsItemCard
              key={item.id}
              item={item}
              compact
              selected={selectedArticleId === item.id}
              onSelect={setSelectedArticleId}
            />
          ))}
          {!newsItems.length && !loading ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No data yet. Go to News List and fetch from backend.
            </p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
