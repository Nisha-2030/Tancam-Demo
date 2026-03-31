import { useMemo } from "react";
import { Navigate } from "react-router-dom";

import { QuizPanel } from "../components/quiz/QuizPanel";
import { useAspirantProgressContext } from "../context/AspirantProgressContext";
import { useNewsContext } from "../context/NewsContext";

export function AspirantQuizFlowPage() {
  const { publishedAspirantContent } = useNewsContext();
  const { progress, completeQuiz } = useAspirantProgressContext();

  const activeArticle = useMemo(() => {
    if (!publishedAspirantContent.length) {
      return null;
    }
    return (
      publishedAspirantContent.find((item) => item.id === progress.currentArticleId) ||
      publishedAspirantContent[0]
    );
  }, [publishedAspirantContent, progress.currentArticleId]);

  const question = activeArticle?.quiz?.questions?.[0] || null;

  if (!progress.newsRead) {
    return <Navigate to="/aspirant" replace />;
  }
  if (!progress.staticGkRead) {
    return <Navigate to="/aspirant/static-gk" replace />;
  }
  if (!activeArticle) {
    return <Navigate to="/aspirant" replace />;
  }

  return (
    <section className="space-y-4">
      <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">Step 3 of 3</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-slate-900">Attempt MCQ</h2>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Attend the quiz and view your aspirant level and score.
        </p>
      </section>

      <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quiz Source</p>
        <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">{activeArticle.title}</h3>
      </article>

      {question ? (
        <QuizPanel
          question={question}
          showFeedback
          onComplete={({ isCorrect }) => {
            completeQuiz(isCorrect ? 100 : 0);
          }}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/85 p-4 text-sm text-slate-600">
          Quiz is not generated for this news yet. Ask admin to generate and republish.
        </div>
      )}

      {progress.quizSubmitted ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-8 text-center shadow-panel">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Aspirant Level</p>
          <h3 className="mt-2 font-display text-4xl font-bold text-emerald-900">{progress.level}</h3>
          <p className="mt-3 text-xl font-semibold text-emerald-800">Score: {progress.score}/100</p>
        </section>
      ) : null}
    </section>
  );
}

