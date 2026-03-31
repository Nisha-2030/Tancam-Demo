import { useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { StaticGKPanel } from "../components/notes/StaticGKPanel";
import { useAspirantProgressContext } from "../context/AspirantProgressContext";
import { useNewsContext } from "../context/NewsContext";

function buildFallbackTopicMatches(article) {
  const text = `${article?.title || ""} ${article?.description || ""} ${article?.content || ""}`;
  const keywords = Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 4)
    )
  ).slice(0, 8);
  const ministries = inferMinistryFacts(text);

  return [
    {
      topic_id: `fallback-${article?.id || "news"}`,
      topic_name: `Current Affairs Context: ${article?.title || "News Item"}`,
      category: "Current Affairs",
      confidence: 0.4,
      match_method: "keyword",
      matched_keywords: keywords,
      facts: [
        { key: "Primary Source", value: article?.source || "Unknown" },
        {
          key: "Revision Focus",
          value: keywords.length ? keywords.join(", ") : "policy, governance, implementation",
        },
        ...ministries,
        {
          key: "Exam Angle",
          value: "Revise institutions, objective, beneficiaries, and implementation details.",
        },
      ],
    },
  ];
}

function inferMinistryFacts(textValue) {
  const text = String(textValue || "").toLowerCase();
  const mapping = [
    {
      name: "Ministry of Finance",
      role: "Nodal economic policy ministry",
      keywords: ["budget", "fiscal", "tax", "rbi", "inflation", "bank", "liquidity"],
    },
    {
      name: "Ministry of External Affairs",
      role: "Nodal diplomatic and foreign-policy ministry",
      keywords: ["treaty", "summit", "bilateral", "global", "foreign", "diplomatic"],
    },
    {
      name: "Ministry of Education",
      role: "Nodal education-policy ministry",
      keywords: ["education", "school", "college", "learning", "nep"],
    },
    {
      name: "Ministry of Environment, Forest and Climate Change",
      role: "Nodal climate and environment ministry",
      keywords: ["climate", "emission", "carbon", "environment", "forest"],
    },
    {
      name: "Department of Space",
      role: "Nodal space program department",
      keywords: ["isro", "satellite", "launch", "space", "orbit"],
    },
  ];
  const found = mapping.filter((item) => item.keywords.some((keyword) => text.includes(keyword)));
  const ministries = found.length
    ? found.slice(0, 2)
    : [{ name: "Relevant Union Ministry", role: "Primary policy ministry for this topic" }];

  return ministries.flatMap((item, index) => [
    { key: `Involved Ministry ${index + 1}`, value: item.name },
    { key: `Role ${index + 1}`, value: item.role },
  ]);
}

function resolveTopicMatches(article) {
  const matches =
    article?.staticGk?.topic_matches ||
    article?.staticGk?.topicMatches ||
    article?.static_gk?.topic_matches ||
    [];
  if (Array.isArray(matches) && matches.length) {
    return matches;
  }
  return buildFallbackTopicMatches(article);
}

export function AspirantStaticGKPage() {
  const navigate = useNavigate();
  const { publishedAspirantContent } = useNewsContext();
  const { progress, markStaticGkRead } = useAspirantProgressContext();

  const activeArticle = useMemo(() => {
    if (!publishedAspirantContent.length) {
      return null;
    }
    return (
      publishedAspirantContent.find((item) => item.id === progress.currentArticleId) ||
      publishedAspirantContent[0]
    );
  }, [publishedAspirantContent, progress.currentArticleId]);

  if (!progress.newsRead) {
    return <Navigate to="/aspirant" replace />;
  }
  if (!activeArticle) {
    return <Navigate to="/aspirant" replace />;
  }

  return (
    <section className="space-y-4">
      <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Step 2 of 3</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-slate-900">Static GK for Today's News</h2>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Study the linked static facts before moving to MCQ.
        </p>
      </section>

      <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Story</p>
        <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">{activeArticle.title}</h3>
      </article>

      <StaticGKPanel topicMatches={resolveTopicMatches(activeArticle)} />

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={markStaticGkRead}
            disabled={progress.staticGkRead}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
              progress.staticGkRead
                ? "cursor-not-allowed bg-cyan-500/70"
                : "bg-cyan-600 hover:bg-cyan-700"
            }`}
          >
            {progress.staticGkRead ? "Completed" : "Mark Static GK as Read"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/aspirant/quiz")}
            disabled={!progress.staticGkRead}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Open MCQ Page
          </button>
        </div>
      </div>
    </section>
  );
}
