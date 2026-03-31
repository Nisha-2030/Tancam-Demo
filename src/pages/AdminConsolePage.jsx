import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchNews, generateNotes, generateQuiz, linkStaticGK } from "../api/newsApi";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { Loader } from "../components/common/Loader";
import { useNewsContext } from "../context/NewsContext";

const GENERATED_STORAGE_KEY = "aie-admin-generated-content-v1";
const ADMIN_STATE_STORAGE_KEY = "aie-admin-console-state-v1";

function readAdminState() {
  try {
    const raw = localStorage.getItem(ADMIN_STATE_STORAGE_KEY);
    if (!raw) {
      return {
        query: "today current affairs india",
        limit: 12,
        approved: [],
        waiting: [],
        rejected: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      query: typeof parsed?.query === "string" ? parsed.query : "today current affairs india",
      limit: Number(parsed?.limit) || 12,
      approved: Array.isArray(parsed?.approved) ? parsed.approved : [],
      waiting: Array.isArray(parsed?.waiting) ? parsed.waiting : [],
      rejected: Array.isArray(parsed?.rejected) ? parsed.rejected : [],
    };
  } catch {
    return {
      query: "today current affairs india",
      limit: 12,
      approved: [],
      waiting: [],
      rejected: [],
    };
  }
}

function writeAdminState(state) {
  localStorage.setItem(ADMIN_STATE_STORAGE_KEY, JSON.stringify(state));
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

function writeGeneratedMap(map) {
  localStorage.setItem(GENERATED_STORAGE_KEY, JSON.stringify(map));
}

function toArticleId(article, index) {
  if (article.id) {
    return article.id;
  }
  if (article.url) {
    return article.url;
  }
  return `${article.title || "article"}-${index}`;
}

function normalizeTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function jaccardSimilarity(aText, bText) {
  const a = new Set(normalizeTokens(aText));
  const b = new Set(normalizeTokens(bText));
  if (!a.size || !b.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function articleText(item) {
  return `${item.title || ""} ${item.description || ""} ${item.content || ""}`.trim();
}

function compareWithPib(article, pibArticles) {
  if (!pibArticles.length) {
    return 0;
  }
  const base = articleText(article);
  let maxScore = 0;
  for (const pibArticle of pibArticles) {
    const score = jaccardSimilarity(base, articleText(pibArticle));
    if (score > maxScore) {
      maxScore = score;
    }
  }
  return Number(maxScore.toFixed(3));
}

function classifyArticle(article, pibSimilarity) {
  const source = String(article.source || "").toLowerCase();
  const sourceIsPib = source.includes("pib") || source.includes("press information bureau");

  if (sourceIsPib || pibSimilarity >= 0.95) {
    return {
      status: "approved",
      trustScore: 100,
      reason: "Auto-approved by AI: PIB verified with high match.",
    };
  }
  if (pibSimilarity >= 0.8) {
    return {
      status: "waiting",
      trustScore: 80,
      reason: "Waiting for admin approval: PIB similarity is at least 80%.",
    };
  }
  return {
    status: "rejected",
    trustScore: 60,
    reason: "Auto-rejected by AI: PIB similarity is below 80%.",
  };
}

function toArticlePayload(item) {
  return {
    title: item.title,
    description: item.description || "",
    content: item.content || "",
    source: item.source || "Unknown",
    url: item.url || null,
    published_at: item.published_at,
    supporting_sources: item.supporting_sources || [],
  };
}

function buildFallbackStaticGk(article) {
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

  return {
    topic_matches: [
      {
        topic_id: `fallback-${article?.id || article?.url || "news"}`,
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
            value: "Revise institutions, objective, beneficiaries, and implementation mechanism.",
          },
        ],
      },
    ],
    total_matches: 1,
    used_embeddings: false,
    dataset_source: "fallback",
  };
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
    {
      name: "Ministry of Electronics and Information Technology",
      role: "Nodal digital governance ministry",
      keywords: ["digital", "technology", "ai", "cyber", "internet"],
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

function ensureStaticGk(article, gkPayload) {
  const matches = gkPayload?.topic_matches || gkPayload?.topicMatches || [];
  if (Array.isArray(matches) && matches.length) {
    return {
      ...gkPayload,
      topic_matches: matches,
      total_matches: gkPayload?.total_matches ?? matches.length,
    };
  }
  return buildFallbackStaticGk(article);
}

export function AdminConsolePage() {
  const navigate = useNavigate();
  const { publishToAspirant } = useNewsContext();
  const initialState = useMemo(() => readAdminState(), []);

  const [query, setQuery] = useState(initialState.query);
  const [limit, setLimit] = useState(initialState.limit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [approved, setApproved] = useState(initialState.approved);
  const [waiting, setWaiting] = useState(initialState.waiting);
  const [rejected, setRejected] = useState(initialState.rejected);
  const [generatedMap, setGeneratedMap] = useState(readGeneratedMap);
  const [generatingId, setGeneratingId] = useState("");

  useEffect(() => {
    writeGeneratedMap(generatedMap);
  }, [generatedMap]);

  useEffect(() => {
    writeAdminState({
      query,
      limit: Number(limit),
      approved,
      waiting,
      rejected,
    });
  }, [approved, limit, query, rejected, waiting]);

  const stats = useMemo(
    () => ({
      approved: approved.length,
      waiting: waiting.length,
      rejected: rejected.length,
      generated: Object.keys(generatedMap).length,
    }),
    [approved.length, waiting.length, rejected.length, generatedMap]
  );

  const fetchAndClassify = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const [newsArticles, pibArticles] = await Promise.all([
        fetchNews(query, Number(limit)),
        fetchNews(`PIB ${query}`, Number(limit)),
      ]);

      const classified = newsArticles.map((article, index) => {
        const id = toArticleId(article, index);
        const pibSimilarity = compareWithPib(article, pibArticles);
        const verdict = classifyArticle(article, pibSimilarity);
        return {
          id,
          ...article,
          pibSimilarity,
          trustScore: verdict.trustScore,
          aiDecision: verdict.reason,
          status: verdict.status,
        };
      });

      setApproved(classified.filter((item) => item.status === "approved"));
      setWaiting(classified.filter((item) => item.status === "waiting"));
      setRejected(classified.filter((item) => item.status === "rejected"));
      setSuccessMessage("News fetched from API and classified against PIB similarity.");
    } catch (err) {
      setError(err.message || "Failed to fetch and classify news");
    } finally {
      setLoading(false);
    }
  };

  const moveWaitingToApproved = (item) => {
    setWaiting((previous) => previous.filter((entry) => entry.id !== item.id));
    setApproved((previous) => [
      ...previous,
      {
        ...item,
        status: "approved",
        aiDecision: "Approved by admin after manual review.",
      },
    ]);
  };

  const moveWaitingToRejected = (item) => {
    setWaiting((previous) => previous.filter((entry) => entry.id !== item.id));
    setRejected((previous) => [
      ...previous,
      {
        ...item,
        status: "rejected",
        aiDecision: "Rejected by admin after manual review.",
      },
    ]);
  };

  const handleGenerateForApproved = async (item) => {
    setGeneratingId(item.id);
    setError("");
    setSuccessMessage("");
    try {
      const payload = toArticlePayload(item);
      const [notes, gk, quiz] = await Promise.all([
        generateNotes(payload, "UPSC CSE"),
        linkStaticGK(payload, { useEmbeddings: true }),
        generateQuiz(payload),
      ]);
      const safeStaticGk = ensureStaticGk(item, gk);

      const record = {
        id: item.id,
        article: item,
        notes,
        staticGk: safeStaticGk,
        quiz,
        generatedAt: new Date().toISOString(),
      };

      setGeneratedMap((previous) => ({ ...previous, [item.id]: record }));
      setSuccessMessage(`Generated notes, static GK and quiz for "${item.title}".`);
    } catch (err) {
      setError(err.message || "Failed to generate content");
    } finally {
      setGeneratingId("");
    }
  };

  const publishApprovedContent = () => {
    const publishable = approved
      .map((item) => {
        const generated = generatedMap[item.id];
        if (!generated) {
          return null;
        }
        return {
          id: item.id,
          title: item.title,
          description: item.description || "",
          content: item.content || "",
          source: item.source,
          url: item.url || null,
          published_at: item.published_at,
          aiDecision: item.aiDecision,
          trustScore: item.trustScore,
          pibSimilarity: item.pibSimilarity,
          notes: generated.notes,
          staticGk: ensureStaticGk(item, generated.staticGk),
          quiz: generated.quiz,
          publishedByAdminAt: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (!publishable.length) {
      setError("Generate content for at least one approved news item before publishing.");
      return;
    }

    const confirm = window.confirm(
      `Publish ${publishable.length} approved item(s) to Aspirant side?`
    );
    if (!confirm) {
      return;
    }

    publishToAspirant(publishable);
    setSuccessMessage("Approved content published to Aspirant side successfully.");
  };

  const renderArticleCard = (item, zone) => {
    const generated = generatedMap[item.id];
    return (
      <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {item.source}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            Trust {item.trustScore}%
          </span>
        </div>

        <h4 className="mt-2 font-display text-lg font-semibold text-slate-900">{item.title}</h4>
        <p className="mt-2 text-sm text-slate-600">{item.description || item.content || "No description available."}</p>

        <div className="mt-3 rounded-xl bg-slate-50 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PIB Match</p>
          <p className="text-sm font-semibold text-slate-900">{Math.round(item.pibSimilarity * 100)}%</p>
          <p className="mt-1 text-xs text-slate-600">{item.aiDecision}</p>
        </div>

        {zone === "waiting" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => moveWaitingToApproved(item)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => moveWaitingToRejected(item)}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              Reject
            </button>
          </div>
        ) : null}

        {zone === "approved" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleGenerateForApproved(item)}
              disabled={generatingId === item.id}
              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            >
              {generatingId === item.id ? "Generating..." : generated ? "Regenerate" : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/admin/content/${encodeURIComponent(item.id)}`)}
              disabled={!generated}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Open Detail Page
            </button>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <section className="space-y-4">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-panel backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Admin Intelligence Flow</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-slate-900">
          Fetch - PIB Verify - Approve - Generate - Publish
        </h2>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Fetches current affairs, compares with PIB similarity, auto-approves 100%, queues 80% for review, rejects
          below 80%, and publishes only generated approved content to aspirants.
        </p>
      </section>

      <form
        onSubmit={fetchAndClassify}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel md:grid-cols-[1.2fr_140px_auto_auto]"
      >
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topic (e.g., budget, isro, rbi, parliament)"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-200 focus:ring"
          required
        />
        <input
          type="number"
          min={5}
          max={30}
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value) || 5)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-200 focus:ring"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Fetching..." : "Fetch News"}
        </button>
        <button
          type="button"
          onClick={publishApprovedContent}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Publish to Aspirant
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Approved: <strong>{stats.approved}</strong>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Waiting: <strong>{stats.waiting}</strong>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Rejected: <strong>{stats.rejected}</strong>
        </div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-800">
          Generated: <strong>{stats.generated}</strong>
        </div>
      </div>

      {loading ? <Loader text="Fetching from API and comparing with PIB..." /> : null}
      <ErrorAlert message={error} />
      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
          <h3 className="mb-3 font-display text-xl font-semibold text-emerald-900">Approved</h3>
          <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1">
            {approved.map((item) => renderArticleCard(item, "approved"))}
            {!approved.length ? (
              <p className="rounded-xl border border-dashed border-emerald-300 bg-white p-3 text-sm text-emerald-700">
                AI-approved stories will appear here.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <h3 className="mb-3 font-display text-xl font-semibold text-amber-900">Waiting for Approval</h3>
          <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1">
            {waiting.map((item) => renderArticleCard(item, "waiting"))}
            {!waiting.length ? (
              <p className="rounded-xl border border-dashed border-amber-300 bg-white p-3 text-sm text-amber-700">
                Admin review queue will appear here.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
          <h3 className="mb-3 font-display text-xl font-semibold text-rose-900">Rejected</h3>
          <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1">
            {rejected.map((item) => renderArticleCard(item, "rejected"))}
            {!rejected.length ? (
              <p className="rounded-xl border border-dashed border-rose-300 bg-white p-3 text-sm text-rose-700">
                Auto-rejected stories will appear here.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
