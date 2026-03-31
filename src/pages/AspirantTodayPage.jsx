import { useEffect, useMemo, useState } from "react";

import { generateNotes, generateQuiz, linkStaticGK } from "../api/newsApi";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { Loader } from "../components/common/Loader";
import { TrustScoreBadge } from "../components/common/TrustScoreBadge";
import { NewsItemCard } from "../components/news/NewsItemCard";
import { NotesPanel } from "../components/notes/NotesPanel";
import { StaticGKPanel } from "../components/notes/StaticGKPanel";
import { QuizPanel } from "../components/quiz/QuizPanel";
import { useNewsContext } from "../context/NewsContext";

export function AspirantTodayPage() {
  const {
    newsItems,
    selectedArticle,
    selectedArticleId,
    setSelectedArticleId,
    runPipeline,
    toArticlePayload,
    loading,
    statusMessage,
    error,
  } = useNewsContext();

  const [digestByArticle, setDigestByArticle] = useState({});
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState("");

  useEffect(() => {
    if (newsItems.length) {
      return;
    }
    runPipeline("today current affairs india", 6, {
      keywords: ["policy", "economy", "governance", "science", "international", "environment"],
      excludedKeywords: ["celebrity", "gossip", "box office", "reality show"],
      useLlm: true,
    });
  }, [newsItems.length, runPipeline]);

  useEffect(() => {
    if (!selectedArticleId && newsItems.length) {
      setSelectedArticleId(newsItems[0].id);
    }
  }, [newsItems, selectedArticleId, setSelectedArticleId]);

  const activeDigest = selectedArticleId ? digestByArticle[selectedArticleId] || null : null;

  const trustAverage = useMemo(() => {
    if (!newsItems.length) {
      return 0;
    }
    return Math.round(newsItems.reduce((acc, item) => acc + (item.trustScore || 0), 0) / newsItems.length);
  }, [newsItems]);

  const generateDigest = async (forceRefresh = false) => {
    if (!selectedArticle) {
      return;
    }
    const cacheKey = selectedArticle.id;
    if (!forceRefresh && digestByArticle[cacheKey]) {
      return;
    }

    setDigestLoading(true);
    setDigestError("");
    try {
      const payload = toArticlePayload(selectedArticle);
      const [notesResult, gkResult, quizResult] = await Promise.all([
        generateNotes(payload, "UPSC CSE"),
        linkStaticGK(payload, { useEmbeddings: true }),
        generateQuiz(payload),
      ]);

      setDigestByArticle((current) => ({
        ...current,
        [cacheKey]: {
          notes: notesResult,
          gk: gkResult,
          quiz: quizResult?.questions?.[0] || null,
          generatedAt: new Date().toISOString(),
        },
      }));
    } catch (err) {
      setDigestError(err.message || "Could not generate today's intelligence capsule");
    } finally {
      setDigestLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedArticle) {
      return;
    }
    generateDigest(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArticleId]);

  return (
    <section className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
        <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-200/55 blur-2xl" />
        <div className="absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-emerald-200/50 blur-2xl" />

        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Daily Aspirant Capsule</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-slate-900">Today's News, Learning Notes & MCQ</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
            Curated current affairs for focused preparation. Each story includes trust score, concise notes, linked
            static GK, and one exam-style MCQ.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white">
              Stories: {newsItems.length}
            </span>
            <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200">
              Avg Trust: {trustAverage}%
            </span>
            <button
              type="button"
              onClick={() => generateDigest(true)}
              disabled={!selectedArticle || digestLoading}
              className="rounded-full bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            >
              Refresh Selected Capsule
            </button>
          </div>
        </div>
      </section>

      {loading ? <Loader text={statusMessage || "Loading today's intelligence..."} /> : null}
      <ErrorAlert message={error} />
      <ErrorAlert message={digestError} />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold text-slate-900">Today's Curated News</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Select a story
            </span>
          </div>

          <div className="grid max-h-[650px] gap-3 overflow-y-auto pr-1">
            {newsItems.map((item) => (
              <NewsItemCard
                key={item.id}
                item={item}
                selected={selectedArticleId === item.id}
                onSelect={setSelectedArticleId}
              />
            ))}
            {!newsItems.length && !loading ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No news available yet. Try again in a few moments.
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          {selectedArticle ? (
            <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {selectedArticle.source}
                </span>
                <TrustScoreBadge score={selectedArticle.trustScore} />
              </div>
              <h3 className="mt-3 font-display text-xl font-semibold text-slate-900">{selectedArticle.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{selectedArticle.description || selectedArticle.content}</p>
            </article>
          ) : null}

          {digestLoading ? <Loader text="Preparing notes, static GK, and MCQ..." /> : null}

          <NotesPanel notes={activeDigest?.notes?.notes} points={activeDigest?.notes?.key_points} />
          <StaticGKPanel topicMatches={activeDigest?.gk?.topic_matches} />
          {activeDigest?.quiz ? <QuizPanel question={activeDigest.quiz} /> : null}
        </section>
      </div>
    </section>
  );
}


