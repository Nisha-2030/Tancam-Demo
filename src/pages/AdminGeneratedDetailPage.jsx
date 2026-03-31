import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { NotesPanel } from "../components/notes/NotesPanel";
import { StaticGKPanel } from "../components/notes/StaticGKPanel";
import { QuizPanel } from "../components/quiz/QuizPanel";

const GENERATED_STORAGE_KEY = "aie-admin-generated-content-v1";

function resolveTopicMatches(record) {
  const matches =
    record?.staticGk?.topic_matches ||
    record?.staticGk?.topicMatches ||
    record?.static_gk?.topic_matches ||
    [];
  if (Array.isArray(matches) && matches.length) {
    return matches;
  }

  const article = record?.article || {};
  const text = `${article.title || ""} ${article.description || ""} ${article.content || ""}`;
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
      topic_id: `fallback-${article.id || "news"}`,
      topic_name: `Current Affairs Context: ${article.title || "News Item"}`,
      category: "Current Affairs",
      confidence: 0.4,
      match_method: "keyword",
      matched_keywords: keywords,
      facts: [
        { key: "Primary Source", value: article.source || "Unknown" },
        { key: "Revision Focus", value: keywords.length ? keywords.join(", ") : "policy, governance" },
        ...ministries,
        {
          key: "Exam Angle",
          value: "Revise institutional background, objective, beneficiaries, and implementation.",
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

function readGeneratedMap() {
  try {
    const raw = localStorage.getItem(GENERATED_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function AdminGeneratedDetailPage() {
  const { itemId } = useParams();

  const record = useMemo(() => {
    const map = readGeneratedMap();
    return map[decodeURIComponent(itemId || "")] || null;
  }, [itemId]);

  if (!record) {
    return <Navigate to="/admin" replace />;
  }

  const quizQuestion = record?.quiz?.questions?.[0] || null;

  return (
    <section className="space-y-4">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-panel backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Admin Detail View</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-slate-900">Generated Aspirant Content</h2>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Full notes, static GK, and quiz with answer/explanation for aspirant readiness.
        </p>
        <Link
          to="/admin"
          className="mt-4 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Back to Admin Columns
        </Link>
      </section>

      <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">News Item</p>
        <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">{record.article?.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{record.article?.content || record.article?.description}</p>
      </article>

      <div className="grid gap-4 lg:grid-cols-2">
        <NotesPanel notes={record?.notes?.notes} points={record?.notes?.key_points} />
        <StaticGKPanel topicMatches={resolveTopicMatches(record)} />
      </div>

      {quizQuestion ? <QuizPanel question={quizQuestion} showFeedback /> : null}
    </section>
  );
}
