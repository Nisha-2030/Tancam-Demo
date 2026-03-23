# Aspirant Intelligence Engine (Mock Demo)

Simple React demo that visually simulates an AI-based exam-news pipeline.

## What This Demo Includes

- 8 manually created news items (relevant + irrelevant)
- `Run AI Filter` simulation for Awards, Schemes, and Science categories
- Trust score simulation:
  - 100%: PIB Verified -> Auto publish
  - 80%: Multi-source -> Review
  - 60%: Low trust -> Reject
- Separate tab pages:
  - Pipeline
  - Quiz Page
  - Notes + Static GK Page
- Static GK expandable block in the Notes page (ISRO, G20, RBI)
- `Generate Notes` to reveal pre-written short notes in Notes page
- MCQs isolated in dedicated Quiz page
- Pipeline sections:
  - Raw News
  - Filtered News
  - Verified Output
- Entry animations that simulate card movement across stages

## Tech Stack

- React (Vite)
- No external API calls (mock-only frontend demo)

## Folder Structure

```text
.
|-- index.html
|-- package.json
|-- vite.config.js
|-- README.md
`-- src
    |-- App.css
    |-- App.jsx
    |-- main.jsx
    |-- components
    |   |-- NewsCard.jsx
    |   |-- QuizBlock.jsx
    |   `-- TrustBadge.jsx
    |-- data
    |   `-- mockNews.js
    `-- utils
        `-- trust.js
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open the local URL shown in terminal (usually `http://localhost:5173`).

## Demo Flow

1. In `Pipeline`, click `Run AI Filter`
2. Click `Verify Trust`
3. Open `Quiz Page` for MCQs
4. Open `Notes + Static GK Page` and click `Generate Notes`
