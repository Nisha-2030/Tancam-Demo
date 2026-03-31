import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "aie-aspirant-progress-v1";

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computeLevel(score) {
  if (score >= 90) {
    return "Exam Ready";
  }
  if (score >= 70) {
    return "Advanced Learner";
  }
  if (score >= 50) {
    return "Consistent Aspirant";
  }
  return "Foundation Builder";
}

function defaultProgress() {
  return {
    day: todayKey(),
    currentArticleId: "",
    newsRead: false,
    staticGkRead: false,
    quizSubmitted: false,
    score: 0,
    level: "Foundation Builder",
  };
}

function readProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultProgress();
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.day !== todayKey()) {
      return defaultProgress();
    }
    return {
      ...defaultProgress(),
      ...parsed,
    };
  } catch {
    return defaultProgress();
  }
}

const AspirantProgressContext = createContext(null);

export function AspirantProgressProvider({ children }) {
  const [progress, setProgress] = useState(readProgress);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const setCurrentArticleId = (articleId) => {
    setProgress((previous) => {
      if (previous.currentArticleId === articleId) {
        return previous;
      }
      return {
        ...previous,
        currentArticleId: articleId || "",
        newsRead: false,
        staticGkRead: false,
        quizSubmitted: false,
        score: 0,
        level: "Foundation Builder",
      };
    });
  };

  const markNewsRead = () => {
    setProgress((previous) => ({ ...previous, newsRead: true }));
  };

  const markStaticGkRead = () => {
    setProgress((previous) => ({ ...previous, staticGkRead: true }));
  };

  const completeQuiz = (score) => {
    const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
    setProgress((previous) => ({
      ...previous,
      quizSubmitted: true,
      score: safeScore,
      level: computeLevel(safeScore),
    }));
  };

  const resetProgress = () => {
    setProgress(defaultProgress());
  };

  const value = useMemo(
    () => ({
      progress,
      setCurrentArticleId,
      markNewsRead,
      markStaticGkRead,
      completeQuiz,
      resetProgress,
      computeLevel,
    }),
    [progress]
  );

  return <AspirantProgressContext.Provider value={value}>{children}</AspirantProgressContext.Provider>;
}

export function useAspirantProgressContext() {
  const context = useContext(AspirantProgressContext);
  if (!context) {
    throw new Error("useAspirantProgressContext must be used inside AspirantProgressProvider");
  }
  return context;
}

