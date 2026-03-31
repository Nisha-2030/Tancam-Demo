import { useEffect, useMemo, useState } from "react";

import { generateQuiz } from "../api/newsApi";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { Loader } from "../components/common/Loader";
import { PageHeader } from "../components/common/PageHeader";
import { NewsItemCard } from "../components/news/NewsItemCard";
import { QuizPanel } from "../components/quiz/QuizPanel";
import { useNewsContext } from "../context/NewsContext";

export function QuizPage() {
  const {
    newsItems,
    selectedArticle,
    selectedArticleId,
    setSelectedArticleId,
    loadNews,
    lastQuery,
    toArticlePayload,
  } = useNewsContext();
  const [quizQuestion, setQuizQuestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedOption = useMemo(
    () => newsItems.find((item) => item.id === selectedArticleId)?.id || "",
    [newsItems, selectedArticleId]
  );

  useEffect(() => {
    if (!newsItems.length) {
      loadNews(lastQuery || "isro", 8);
    }
  }, [lastQuery, loadNews, newsItems.length]);

  const handleGenerateQuiz = async () => {
    if (!selectedArticle) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await generateQuiz(toArticlePayload(selectedArticle));
      setQuizQuestion(response?.questions?.[0] || null);
    } catch (err) {
      setError(err.message || "Failed to generate quiz");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Quiz Section"
        description="Generate one validated MCQ from selected news content and test your understanding."
      />

      <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-panel backdrop-blur">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
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

          <button
            type="button"
            onClick={handleGenerateQuiz}
            disabled={!selectedArticle || loading}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            Generate MCQ
          </button>
        </div>
      </section>

      {loading ? <Loader text="Generating quiz from selected content..." /> : null}
      <ErrorAlert message={error} />

      {selectedArticle ? <NewsItemCard item={selectedArticle} compact selected={false} /> : null}

      {quizQuestion ? (
        <QuizPanel question={quizQuestion} />
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          Generate an MCQ to start the quiz.
        </p>
      )}
    </section>
  );
}
