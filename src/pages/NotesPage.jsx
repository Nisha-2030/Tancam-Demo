import { useEffect, useMemo, useState } from "react";

import { generateNotes, linkStaticGK } from "../api/newsApi";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { Loader } from "../components/common/Loader";
import { PageHeader } from "../components/common/PageHeader";
import { NotesPanel } from "../components/notes/NotesPanel";
import { StaticGKPanel } from "../components/notes/StaticGKPanel";
import { NewsItemCard } from "../components/news/NewsItemCard";
import { useNewsContext } from "../context/NewsContext";

export function NotesPage() {
  const {
    newsItems,
    selectedArticle,
    selectedArticleId,
    setSelectedArticleId,
    loadNews,
    lastQuery,
    toArticlePayload,
  } = useNewsContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [useEmbeddings, setUseEmbeddings] = useState(false);
  const [notesData, setNotesData] = useState(null);
  const [gkData, setGkData] = useState(null);

  const selectedOption = useMemo(
    () => newsItems.find((item) => item.id === selectedArticleId)?.id || "",
    [newsItems, selectedArticleId]
  );

  useEffect(() => {
    if (!newsItems.length) {
      loadNews(lastQuery || "isro", 8);
    }
  }, [lastQuery, loadNews, newsItems.length]);

  const handleGenerate = async () => {
    if (!selectedArticle) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const articlePayload = toArticlePayload(selectedArticle);
      const [notesResult, gkResult] = await Promise.all([
        generateNotes(articlePayload, "UPSC CSE"),
        linkStaticGK(articlePayload, { useEmbeddings }),
      ]);
      setNotesData(notesResult);
      setGkData(gkResult);
    } catch (err) {
      setError(err.message || "Failed to generate notes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Notes View"
        description="Generate factual bullet notes and linked static GK facts for the selected news item."
      />

      <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-panel backdrop-blur">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <select
            value={selectedOption}
            onChange={(event) => setSelectedArticleId(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
          >
            <option value="">Select article</option>
            {newsItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={useEmbeddings}
              onChange={(event) => setUseEmbeddings(event.target.checked)}
            />
            Use embedding match
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!selectedArticle || loading}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            Generate Notes
          </button>
        </div>
      </section>

      {loading ? <Loader text="Generating notes and linking static GK..." /> : null}
      <ErrorAlert message={error} />

      {selectedArticle ? (
        <NewsItemCard item={selectedArticle} compact selected={false} />
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          Select an article from News List first.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <NotesPanel notes={notesData?.notes} points={notesData?.key_points} />
        <StaticGKPanel topicMatches={gkData?.topic_matches} />
      </div>
    </section>
  );
}
