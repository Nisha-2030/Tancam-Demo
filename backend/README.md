# AI-Powered Aspirant Intelligence Engine - FastAPI Backend

## Folder Structure

```text
backend/
  app/
    api/
      routes/
        content.py
        news.py
      router.py
    core/
      config.py
      database.py
      exceptions.py
      handlers.py
    models/
      news.py
    schemas/
      common.py
      content.py
      news.py
    services/
      ai_service.py
      content_service.py
      filtering_service.py
      news_service.py
      static_gk_service.py
      trust_service.py
    data/
      static_gk_dataset.json
    utils/
      scoring.py
    main.py
  .env.example
  requirements.txt
```

## Setup

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Set your `newsdata.io` key in `.env`:

```env
NEWS_API_URL=https://newsdata.io/api/1/latest
NEWS_API_KEY=your_newsdata_key
STATIC_GK_EXTERNAL_URL=https://your-static-gk-source.example/api/topics
STATIC_GK_EXTERNAL_API_KEY=your_optional_key
STATIC_GK_EXTERNAL_AUTH_HEADER=Authorization
```

## API Base

`http://127.0.0.1:8000/api/v1`

## Endpoints with Sample Request/Response

### 1) Fetch News

`POST /news/fetch`

Request:

```json
{
  "query": "budget",
  "limit": 3
}
```

Response (sample):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "title": "Budget Update #1",
        "description": "Government launches a new skilling initiative...",
        "content": "Government launches a new skilling initiative...",
        "source": "PIB",
        "url": "https://example.com/news/budget-1",
        "published_at": "2026-03-30T10:00:00Z"
      }
    ],
    "total": 3
  },
  "message": "News fetched successfully",
  "timestamp": "2026-03-30T10:00:00Z"
}
```

### 2) Filter News

`POST /news/filter`

Request:

```json
{
  "keywords": ["economy", "policy"],
  "excluded_keywords": ["celebrity", "box office"],
  "max_llm_batch_size": 20,
  "use_llm": true,
  "items": [
    {
      "title": "Budget Update #1",
      "description": "Government policy update",
      "content": "New economy policy announced...",
      "source": "PIB",
      "supporting_sources": ["Reuters", "BBC"],
      "url": "https://example.com/news/budget-1",
      "published_at": "2026-03-30T10:00:00Z"
    }
  ]
}
```

Response (sample):

```json
{
  "success": true,
  "data": {
    "ranked_items": [
      {
        "article": {
          "title": "Budget Update #1",
          "description": "Government policy update",
          "content": "New economy policy announced...",
          "source": "PIB",
          "url": "https://example.com/news/budget-1",
          "published_at": "2026-03-30T10:00:00Z"
        },
        "keyword_filter": {
          "include_hits": ["economy", "policy"],
          "exclude_hits": [],
          "keyword_score": 0.4,
          "stage1_passed": true
        },
        "classification": {
          "label": "relevant",
          "confidence": 0.88,
          "reason": "Policy update with exam relevance",
          "model": "gpt-4o-mini",
          "fallback_used": false
        },
        "ranking": {
          "rank_score": 77.2,
          "rank_position": 1,
          "source_reputation": 0.95,
          "recency_score": 1.0,
          "content_quality": 0.6,
          "keyword_score": 0.4,
          "llm_confidence": 0.88
        }
      }
    ],
    "total_input": 1,
    "stage1_passed": 1,
    "stage2_relevant": 1,
    "total_ranked": 1
  },
  "message": "News filtered successfully",
  "timestamp": "2026-03-30T10:00:05Z"
}
```

### 2.1) Run Full News Pipeline (Optimized Single Call)

`POST /news/pipeline`

Request:

```json
{
  "query": "isro",
  "limit": 8,
  "keywords": ["policy", "economy", "science"],
  "excluded_keywords": ["celebrity", "gossip"],
  "max_llm_batch_size": 20,
  "use_llm": true
}
```

Response (sample):

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "total_fetched": 8,
    "total_filtered": 3,
    "processing_ms": 950,
    "cache_hit": false
  },
  "message": "News pipeline completed successfully",
  "timestamp": "2026-03-30T10:00:06Z"
}
```

### 3) Assign Trust Score

`POST /news/trust-score`

Request:

```json
{
  "items": [
    {
      "title": "Budget Update #1",
      "description": "Government policy update",
      "content": "New economy policy announced...",
      "source": "PIB",
      "url": "https://example.com/news/budget-1",
      "published_at": "2026-03-30T10:00:00Z"
    }
  ]
}
```

Dynamic refresh endpoint:

`POST /news/trust-score/refresh`

Response (sample):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "article": {
          "title": "Budget Update #1",
          "description": "Government policy update",
          "content": "New economy policy announced...",
          "source": "PIB",
          "supporting_sources": ["Reuters", "BBC"],
          "url": "https://example.com/news/budget-1",
          "published_at": "2026-03-30T10:00:00Z"
        },
        "trust_score": 100,
        "trust_level": "HIGH",
        "factors": {
          "primary_source": "PIB",
          "primary_source_reliability": 1.0,
          "source_reliability_map": {
            "pib": 1.0,
            "reuters": 0.95,
            "bbc": 0.92
          },
          "trusted_source_count": 3,
          "cross_verified_sources": ["pib", "reuters", "bbc"],
          "verification_rule": "government_source",
          "dynamic_updated_at": "2026-03-30T10:00:10Z"
        },
        "confidence_note": "Primary source is PIB (government source).",
        "version": 2
      }
    ],
    "total": 1
  },
  "message": "Trust scores assigned successfully",
  "timestamp": "2026-03-30T10:00:10Z"
}
```

### 4) Generate Notes

`POST /content/notes`

Request:

```json
{
  "exam_context": "UPSC CSE",
  "article": {
    "title": "Budget Update #1",
    "description": "Government policy update",
    "content": "New economy policy announced...",
    "source": "PIB",
    "url": "https://example.com/news/budget-1",
    "published_at": "2026-03-30T10:00:00Z"
  }
}
```

Response (sample):

```json
{
  "success": true,
  "data": {
    "notes": "- Government announces new economy policy update.\n- Policy highlights implementation roadmap and stakeholder impact.\n- Update is sourced from PIB and linked to governance reforms.",
    "key_points": [
      "Government announces new economy policy update.",
      "Policy highlights implementation roadmap and stakeholder impact.",
      "Update is sourced from PIB and linked to governance reforms."
    ],
    "generated_by": "openai-verified"
  },
  "message": "Notes generated successfully",
  "timestamp": "2026-03-30T10:00:15Z"
}
```

### 5) Generate Quiz

`POST /content/quiz`

Request:

```json
{
  "num_questions": 1,
  "article": {
    "title": "Budget Update #1",
    "description": "Government policy update",
    "content": "New economy policy announced...",
    "source": "PIB",
    "url": "https://example.com/news/budget-1",
    "published_at": "2026-03-30T10:00:00Z"
  }
}
```

Response (sample):

```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "question": "According to the provided content, which statement is correct?",
        "options": [
          "The source states a new economy policy was announced.",
          "The source says the event is fictional.",
          "The source discusses only entertainment gossip.",
          "The source gives no event details."
        ],
        "answer": "The source states a new economy policy was announced.",
        "explanation": "The correct option is directly supported by the given content."
      }
    ],
    "generated_by": "openai-verified"
  },
  "message": "Quiz generated successfully",
  "timestamp": "2026-03-30T10:00:20Z"
}
```

### 6) Link Static GK Topics

`POST /content/static-gk/link`

Request:

```json
{
  "top_k": 3,
  "min_score": 0.2,
  "use_embeddings": true,
  "dataset_source": "auto",
  "persist_result": true,
  "article": {
    "title": "ISRO successfully launches advanced earth observation satellite",
    "description": "The mission used PSLV and placed the satellite in sun-synchronous orbit.",
    "content": "ISRO completed another satellite launch from Sriharikota.",
    "source": "PIB",
    "url": "https://example.com/isro-launch",
    "published_at": "2026-03-30T10:00:00Z"
  }
}
```

Response (sample):

```json
{
  "success": true,
  "data": {
    "topic_matches": [
      {
        "topic_id": "isro",
        "topic_name": "Indian Space Research Organisation (ISRO)",
        "category": "Science and Technology",
        "confidence": 0.93,
        "match_method": "keyword+embedding",
        "matched_keywords": ["isro", "satellite launch", "pslv", "launch", "satellite", "mission"],
        "facts": [
          { "key": "Founded", "value": "1969" },
          { "key": "Headquarters", "value": "Bengaluru, Karnataka" },
          { "key": "Chairman", "value": "Dr. V. Narayanan" }
        ]
      }
    ],
    "total_matches": 1,
    "used_embeddings": true,
    "dataset_source": "json"
  },
  "message": "Static GK topics linked successfully",
  "timestamp": "2026-03-30T10:00:25Z"
}
```

### 7) Sync Static GK Dataset to MongoDB

`POST /content/static-gk/sync`

Response (sample):

```json
{
  "success": true,
  "data": {
    "upserted_count": 8,
    "source": "json_dataset"
  },
  "message": "Static GK dataset synced to MongoDB",
  "timestamp": "2026-03-30T10:00:30Z"
}
```

### 8) Sync External Static GK Dataset to MongoDB

`POST /content/static-gk/sync-external`

Response (sample):

```json
{
  "success": true,
  "data": {
    "upserted_count": 124,
    "source": "external_dataset"
  },
  "message": "External Static GK dataset synced to MongoDB",
  "timestamp": "2026-03-31T10:00:00Z"
}
```

## Notes

- If `OPENAI_API_KEY` is set, filtering/notes/quiz uses OpenAI.
- If not set, app uses deterministic fallback logic.
- On startup, app validates MongoDB connection by running a ping command.
- News filtering runs in 3 stages: keyword filter -> LLM classification -> heuristic ranking.
- Trust score rules: PIB => 100, 2+ trusted sources => 80, single source => 60.
- Static GK linking supports two modes: keyword-only and keyword + embedding rerank.
- Static GK linking now supports `json`, `mongo`, `external`, and `merged` dataset sources.
- Performance optimization includes request-level caching (memory/Redis), OpenAI response caching, and a single-call `/news/pipeline` endpoint for reduced frontend latency.
