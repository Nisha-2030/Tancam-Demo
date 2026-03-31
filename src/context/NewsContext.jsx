import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { assignTrustScores, fetchNews, filterNews, runNewsPipeline } from "../api/newsApi";

const NewsContext = createContext(null);
const APPROVED_STORAGE_KEY = "aie-approved-news-v1";
const PUBLISHED_STORAGE_KEY = "aie-published-content-v1";

function readApprovedNewsItems() {
  try {
    const raw = localStorage.getItem(APPROVED_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => item && typeof item.id === "string");
  } catch {
    return [];
  }
}

function writeApprovedNewsItems(items) {
  localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(items));
}

function buildFallbackStaticGk(item) {
  const text = `${item?.title || ""} ${item?.description || ""} ${item?.content || ""}`;
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
        topic_id: `fallback-${item?.id || "news"}`,
        topic_name: `Current Affairs Context: ${item?.title || "News Item"}`,
        category: "Current Affairs",
        confidence: 0.4,
        match_method: "keyword",
        matched_keywords: keywords,
        facts: [
          { key: "Primary Source", value: item?.source || "Unknown" },
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

function normalizePublishedItem(item) {
  if (!item || typeof item.id !== "string") {
    return null;
  }
  const existingStaticGk = item.staticGk || {};
  const matches = existingStaticGk.topic_matches || existingStaticGk.topicMatches || [];
  const staticGk =
    Array.isArray(matches) && matches.length
      ? {
          ...existingStaticGk,
          topic_matches: matches,
          total_matches: existingStaticGk.total_matches ?? matches.length,
        }
      : buildFallbackStaticGk(item);

  return {
    ...item,
    staticGk,
  };
}

function readPublishedContent() {
  try {
    const raw = localStorage.getItem(PUBLISHED_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizePublishedItem).filter(Boolean);
  } catch {
    return [];
  }
}

function writePublishedContent(items) {
  localStorage.setItem(PUBLISHED_STORAGE_KEY, JSON.stringify(items));
}

function isTodayDate(dateValue) {
  if (!dateValue) {
    return false;
  }
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const today = new Date();
  return (
    parsed.getFullYear() === today.getFullYear() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getDate() === today.getDate()
  );
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

function toNewsItem(scoredItem, index) {
  const article = scoredItem.article || {};
  const fallbackId = `${article.title || "article"}-${index}`;
  return {
    id: article.url || fallbackId,
    ...article,
    trustScore: scoredItem.trust_score ?? 0,
    trustLevel: scoredItem.trust_level ?? "LOW",
    trustFactors: scoredItem.factors ?? null,
    confidenceNote: scoredItem.confidence_note ?? "",
  };
}

function toUnscoredNewsItem(article, index) {
  const fallbackId = `${article.title || "article"}-${index}`;
  return {
    id: article.url || fallbackId,
    ...article,
    trustScore: 0,
    trustLevel: "UNKNOWN",
    trustFactors: null,
    confidenceNote: "",
  };
}

const initialPipelineStats = {
  fetched: 0,
  filtered: 0,
  trusted: 0,
  stage: "idle",
};

export function NewsProvider({ children }) {
  const [newsItems, setNewsItems] = useState([]);
  const [approvedNewsItems, setApprovedNewsItems] = useState(readApprovedNewsItems);
  const [publishedAspirantContent, setPublishedAspirantContent] = useState(readPublishedContent);
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [lastQuery, setLastQuery] = useState("isro");
  const [pipelineStats, setPipelineStats] = useState(initialPipelineStats);

  const selectedArticle = useMemo(
    () => newsItems.find((item) => item.id === selectedArticleId) || null,
    [newsItems, selectedArticleId]
  );

  useEffect(() => {
    writeApprovedNewsItems(approvedNewsItems);
  }, [approvedNewsItems]);

  useEffect(() => {
    writePublishedContent(publishedAspirantContent);
  }, [publishedAspirantContent]);

  useEffect(() => {
    if (!newsItems.length) {
      return;
    }
    setApprovedNewsItems((previous) =>
      previous.map((approvedItem) => {
        const latest = newsItems.find((item) => item.id === approvedItem.id);
        if (!latest) {
          return approvedItem;
        }
        return {
          ...approvedItem,
          ...latest,
          approvedAt: approvedItem.approvedAt,
        };
      })
    );
  }, [newsItems]);

  const hydrateWithTrust = useCallback(async (articles) => {
    const scored = await assignTrustScores(articles);
    return scored.map((entry, index) => toNewsItem(entry, index));
  }, []);

  const runPipeline = useCallback(
    async (query, limit = 10, options = {}) => {
      const keywords = options.keywords || ["policy", "economy", "governance", "science"];
      const excludedKeywords = options.excludedKeywords || ["celebrity", "gossip", "box office"];
      const useLlm = options.useLlm ?? true;

      setLoading(true);
      setError("");
      setStatusMessage("Fetching news from backend...");
      setLastQuery(query);

      try {
        setStatusMessage("Running full backend pipeline...");
        const pipelineResult = await runNewsPipeline(query, limit, {
          keywords,
          excludedKeywords,
          useLlm,
        });
        const hydrated = (pipelineResult?.items || []).map((entry, index) => toNewsItem(entry, index));
        setNewsItems(hydrated);
        setSelectedArticleId(hydrated[0]?.id || "");
        setPipelineStats({
          fetched: pipelineResult?.total_fetched ?? hydrated.length,
          filtered: pipelineResult?.total_filtered ?? hydrated.length,
          trusted: pipelineResult?.total ?? hydrated.length,
          stage: pipelineResult?.cache_hit ? "trusted-cache" : "trusted",
        });
      } catch (err) {
        // Backward compatibility mode when /news/pipeline is unavailable.
        try {
          setStatusMessage("Pipeline endpoint unavailable. Falling back to compatibility mode...");
          const fetchedArticles = await fetchNews(query, limit);
          setPipelineStats((prev) => ({
            ...prev,
            fetched: fetchedArticles.length,
            stage: "fetched",
          }));

          let filteredArticles = fetchedArticles;
          setStatusMessage("Running AI filter...");
          try {
            const filterResult = await filterNews(fetchedArticles, {
              keywords,
              excludedKeywords,
              useLlm,
            });
            filteredArticles = (filterResult?.ranked_items || []).map((entry) => entry.article);
            setPipelineStats((prev) => ({
              ...prev,
              filtered: filteredArticles.length,
              stage: "filtered",
            }));
          } catch (_filterErr) {
            setError("AI filter failed. Continuing with fetched articles.");
            setPipelineStats((prev) => ({
              ...prev,
              filtered: fetchedArticles.length,
              stage: "filter-failed",
            }));
          }

          setStatusMessage("Calculating trust scores...");
          let hydrated = [];
          try {
            hydrated = await hydrateWithTrust(filteredArticles);
            setPipelineStats((prev) => ({
              ...prev,
              trusted: hydrated.length,
              stage: "trusted",
            }));
          } catch (_trustErr) {
            hydrated = filteredArticles.map((item, index) => toUnscoredNewsItem(item, index));
            setError("Trust scoring failed. Showing unscored results.");
            setPipelineStats((prev) => ({
              ...prev,
              trusted: 0,
              stage: "trust-failed",
            }));
          }

          setNewsItems(hydrated);
          setSelectedArticleId(hydrated[0]?.id || "");
        } catch (fallbackErr) {
          setError(fallbackErr.message || err.message || "Pipeline failed");
          setPipelineStats(initialPipelineStats);
        }
      } finally {
        setLoading(false);
        setStatusMessage("");
      }
    },
    [hydrateWithTrust]
  );

  const loadNews = useCallback(
    async (query, limit = 10) => {
      await runPipeline(query, limit);
    },
    [runPipeline]
  );

  const refreshTrustScores = useCallback(async () => {
    if (!newsItems.length) {
      return;
    }
    setLoading(true);
    setStatusMessage("Refreshing trust scores...");
    setError("");
    try {
      const articles = newsItems.map((item) => toArticlePayload(item));
      const hydrated = await hydrateWithTrust(articles);
      setNewsItems(hydrated);
      setSelectedArticleId((current) => current || hydrated[0]?.id || "");
      setPipelineStats((prev) => ({
        ...prev,
        trusted: hydrated.length,
        stage: "trusted",
      }));
    } catch (err) {
      setError(err.message || "Failed to refresh trust scores");
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  }, [hydrateWithTrust, newsItems]);

  const isArticleApproved = useCallback(
    (articleId) => approvedNewsItems.some((item) => item.id === articleId),
    [approvedNewsItems]
  );

  const toggleApprovedArticle = useCallback((article) => {
    if (!article?.id) {
      return false;
    }

    let isApprovedAfterToggle = false;
    setApprovedNewsItems((previous) => {
      const exists = previous.some((item) => item.id === article.id);
      if (exists) {
        isApprovedAfterToggle = false;
        return previous.filter((item) => item.id !== article.id);
      }
      isApprovedAfterToggle = true;
      return [
        ...previous,
        {
          ...article,
          approvedAt: new Date().toISOString(),
        },
      ];
    });

    return isApprovedAfterToggle;
  }, []);

  const aspirantNewsItems = useMemo(() => {
    const trustedApproved = approvedNewsItems.filter((item) => Number(item.trustScore || 0) >= 80);
    const todayItems = trustedApproved.filter((item) => isTodayDate(item.published_at));
    const selectedPool = todayItems.length ? todayItems : trustedApproved;

    return [...selectedPool].sort((a, b) => {
      const trustDiff = Number(b.trustScore || 0) - Number(a.trustScore || 0);
      if (trustDiff !== 0) {
        return trustDiff;
      }
      const dateA = new Date(a.published_at || 0).getTime();
      const dateB = new Date(b.published_at || 0).getTime();
      return dateB - dateA;
    });
  }, [approvedNewsItems]);

  const publishToAspirant = useCallback((items) => {
    const normalized = Array.isArray(items)
      ? items.map(normalizePublishedItem).filter(Boolean)
      : [];
    setPublishedAspirantContent(normalized);
  }, []);

  const value = useMemo(
    () => ({
      newsItems,
      approvedNewsItems,
      aspirantNewsItems,
      publishedAspirantContent,
      selectedArticle,
      selectedArticleId,
      setSelectedArticleId,
      loading,
      statusMessage,
      error,
      lastQuery,
      pipelineStats,
      loadNews,
      runPipeline,
      refreshTrustScores,
      isArticleApproved,
      toggleApprovedArticle,
      publishToAspirant,
      toArticlePayload,
    }),
    [
      newsItems,
      approvedNewsItems,
      aspirantNewsItems,
      publishedAspirantContent,
      selectedArticle,
      selectedArticleId,
      loading,
      statusMessage,
      error,
      lastQuery,
      pipelineStats,
      loadNews,
      runPipeline,
      refreshTrustScores,
      isArticleApproved,
      toggleApprovedArticle,
      publishToAspirant,
    ]
  );

  return <NewsContext.Provider value={value}>{children}</NewsContext.Provider>;
}

export function useNewsContext() {
  const context = useContext(NewsContext);
  if (!context) {
    throw new Error("useNewsContext must be used inside NewsProvider");
  }
  return context;
}
