import { apiRequest } from "./client";

export async function fetchNews(query, limit = 10) {
  const data = await apiRequest("/news/fetch", {
    method: "POST",
    body: { query, limit },
  });
  return data?.items ?? [];
}

export async function runNewsPipeline(query, limit = 10, options = {}) {
  return apiRequest("/news/pipeline", {
    method: "POST",
    body: {
      query,
      limit,
      keywords: options.keywords ?? [],
      excluded_keywords: options.excludedKeywords ?? [],
      max_llm_batch_size: options.maxBatchSize ?? 20,
      use_llm: options.useLlm ?? true,
    },
  });
}

export async function assignTrustScores(items) {
  const data = await apiRequest("/news/trust-score", {
    method: "POST",
    body: { items },
  });
  return data?.items ?? [];
}

export async function filterNews(items, options = {}) {
  return apiRequest("/news/filter", {
    method: "POST",
    body: {
      items,
      keywords: options.keywords ?? [],
      excluded_keywords: options.excludedKeywords ?? [],
      max_llm_batch_size: options.maxBatchSize ?? 20,
      use_llm: options.useLlm ?? true,
    },
  });
}

export async function generateNotes(article, examContext = "UPSC CSE") {
  return apiRequest("/content/notes", {
    method: "POST",
    body: { article, exam_context: examContext },
  });
}

export async function generateQuiz(article) {
  return apiRequest("/content/quiz", {
    method: "POST",
    body: { article, num_questions: 1 },
  });
}

export async function linkStaticGK(article, options = {}) {
  return apiRequest("/content/static-gk/link", {
    method: "POST",
    body: {
      article,
      top_k: options.topK ?? 3,
      min_score: options.minScore ?? 0.2,
      use_embeddings: options.useEmbeddings ?? false,
      dataset_source: options.datasetSource ?? "auto",
      persist_result: options.persistResult ?? true,
    },
  });
}
