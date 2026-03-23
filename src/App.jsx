import { useEffect, useMemo, useRef, useState } from "react";
import { NewsCard } from "./components/NewsCard";
import { mockNews } from "./data/mockNews";

const RELEVANT_CATEGORIES = new Set(["Awards", "Schemes", "Science"]);
const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "quiz", label: "Quiz Page" },
  { id: "notes", label: "Notes + Static GK" }
];
const PIPELINE_STEPS = [
  { id: "collect", title: "Collect", description: "Raw mixed news feed" },
  { id: "filter", title: "Filter", description: "Keep exam-relevant categories" },
  { id: "verify", title: "Verify", description: "Trust score based decision" },
  { id: "notes", title: "Enrich", description: "Static GK + short notes" }
];

function App() {
  const [activeTab, setActiveTab] = useState("pipeline");
  const [rawNews] = useState(mockNews);
  const [filteredNews, setFilteredNews] = useState([]);
  const [verifiedNews, setVerifiedNews] = useState([]);
  const [notesGenerated, setNotesGenerated] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState("");
  const [filterCycle, setFilterCycle] = useState(0);
  const [verifyCycle, setVerifyCycle] = useState(0);
  const timersRef = useRef([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const runWithDelay = (message, callback) => {
    setError("");
    setBusyMessage(message);

    const timer = setTimeout(() => {
      try {
        callback();
      } catch (_err) {
        setError("Simulation failed. Please retry.");
      } finally {
        setBusyMessage("");
      }
    }, 900);

    timersRef.current.push(timer);
  };

  const handleFilter = () => {
    runWithDelay("Running AI relevance filter...", () => {
      const onlyRelevant = rawNews.filter((item) => RELEVANT_CATEGORIES.has(item.category));
      setFilteredNews(onlyRelevant);
      setVerifiedNews([]);
      setNotesGenerated(false);
      setFilterCycle((prev) => prev + 1);
      setVerifyCycle(0);
    });
  };

  const handleVerify = () => {
    if (!filteredNews.length) {
      setError("Run AI Filter first.");
      return;
    }

    runWithDelay("Computing trust score decisions...", () => {
      setVerifiedNews(filteredNews);
      setVerifyCycle((prev) => prev + 1);
    });
  };

  const handleNotes = () => {
    runWithDelay("Generating short notes...", () => {
      setNotesGenerated(true);
    });
  };

  const handleReset = () => {
    setError("");
    setBusyMessage("");
    setFilteredNews([]);
    setVerifiedNews([]);
    setNotesGenerated(false);
    setFilterCycle(0);
    setVerifyCycle(0);
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
  };

  const summary = useMemo(() => {
    const autoPublish = verifiedNews.filter((item) => item.trustScore >= 100).length;
    const review = verifiedNews.filter((item) => item.trustScore >= 80 && item.trustScore < 100).length;
    const reject = verifiedNews.filter((item) => item.trustScore < 80).length;

    return { autoPublish, review, reject };
  }, [verifiedNews]);

  const relevantFromRaw = useMemo(
    () => rawNews.filter((item) => RELEVANT_CATEGORIES.has(item.category)),
    [rawNews]
  );

  const stagedItems = useMemo(() => {
    if (verifiedNews.length) {
      return {
        source: "Verified Output",
        items: verifiedNews
      };
    }

    if (filteredNews.length) {
      return {
        source: "Filtered News",
        items: filteredNews
      };
    }

    return {
      source: "Relevant Raw Sample",
      items: relevantFromRaw
    };
  }, [filteredNews, relevantFromRaw, verifiedNews]);

  const stageId = useMemo(() => {
    if (notesGenerated) {
      return "notes";
    }
    if (verifiedNews.length) {
      return "verify";
    }
    if (filteredNews.length) {
      return "filter";
    }
    return "collect";
  }, [filteredNews.length, notesGenerated, verifiedNews.length]);

  const stageLabel = useMemo(() => {
    const labels = {
      collect: "Collecting Raw Feed",
      filter: "AI Filter Completed",
      verify: "Trust Verification Ready",
      notes: "Knowledge Enrichment Ready"
    };
    return labels[stageId];
  }, [stageId]);

  const kpis = useMemo(() => {
    const reviewQueue = verifiedNews.filter((item) => item.trustScore >= 80 && item.trustScore < 100).length;
    const rejected = verifiedNews.filter((item) => item.trustScore < 80).length;
    return [
      { label: "Raw Items", value: rawNews.length, tone: "kpi-blue" },
      { label: "Relevant", value: relevantFromRaw.length, tone: "kpi-teal" },
      { label: "Published", value: summary.autoPublish, tone: "kpi-green" },
      { label: "Review Queue", value: reviewQueue, tone: "kpi-amber" },
      { label: "Rejected", value: rejected, tone: "kpi-red" },
      { label: "Notes Ready", value: notesGenerated ? "Yes" : "No", tone: "kpi-indigo" }
    ];
  }, [notesGenerated, rawNews.length, relevantFromRaw.length, summary.autoPublish, verifiedNews]);

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-main">
          <p className="hero-kicker">Interactive Demo Console</p>
          <h1>Aspirant Intelligence Engine</h1>
          <p className="hero-subtitle">
            AI-assisted current affairs pipeline simulation for SSC, RRB, and Banking prep workflows.
          </p>
          <div className="hero-tags">
            <span>Mock Data</span>
            <span>No External APIs</span>
            <span>Trust Score Logic</span>
          </div>
        </div>
        <aside className="hero-stage">
          <p>Live Pipeline State</p>
          <h3>{stageLabel}</h3>
          <div className="hero-stage-meta">
            <span>Raw {rawNews.length}</span>
            <span>Filtered {filteredNews.length}</span>
            <span>Verified {verifiedNews.length}</span>
          </div>
        </aside>
      </header>

      <section className="tab-row">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn ${activeTab === tab.id ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section className="control-panel">
        <div className="toolbar">
          <button type="button" className="action-btn action-primary" disabled={!!busyMessage} onClick={handleFilter}>
            Run AI Filter
          </button>
          <button type="button" className="action-btn" disabled={!!busyMessage} onClick={handleVerify}>
            Verify Trust
          </button>
          <button type="button" className="action-btn" disabled={!!busyMessage} onClick={handleNotes}>
            Generate Notes
          </button>
          <button type="button" className="action-btn action-muted" disabled={!!busyMessage} onClick={handleReset}>
            Reset
          </button>
        </div>

        <section className="status-row">
          {busyMessage ? <span className="status-chip loading">{busyMessage}</span> : null}
          {error ? <span className="status-chip error">{error}</span> : null}
          {verifiedNews.length ? (
            <>
              <span className="status-chip publish">Auto publish: {summary.autoPublish}</span>
              <span className="status-chip review">Review: {summary.review}</span>
              <span className="status-chip reject">Reject: {summary.reject}</span>
            </>
          ) : null}
        </section>
      </section>

      <section className="kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className={`kpi-card ${kpi.tone}`}>
            <p>{kpi.label}</p>
            <h3>{kpi.value}</h3>
          </article>
        ))}
      </section>

      <section className="progress-track">
        {PIPELINE_STEPS.map((step, index) => {
          const activeIndex = PIPELINE_STEPS.findIndex((current) => current.id === stageId);
          const stepState = index < activeIndex ? "done" : index === activeIndex ? "active" : "idle";

          return (
            <article key={step.id} className={`track-step step-${stepState}`}>
              <span className="track-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.description}</p>
              </div>
            </article>
          );
        })}
      </section>

      {activeTab === "pipeline" ? (
        <>
          <section className="flow-strip">
            <span>Raw Intake</span>
            <span className="flow-arrow">{"→"}</span>
            <span>AI Filter</span>
            <span className="flow-arrow">{"→"}</span>
            <span>Trust Verification</span>
          </section>

          <section className="pipeline-grid">
            <div className="lane lane-raw">
            <div className="lane-header">
              <h2>Raw News</h2>
              <span>{rawNews.length}</span>
            </div>
            <p className="lane-caption">Mixed input stream (relevant + irrelevant)</p>
            <div className="card-stack">
              {rawNews.map((item, index) => (
                <NewsCard
                  key={`raw-${item.id}`}
                  item={item}
                  showTrust={false}
                  surfaceTone="raw"
                  delay={index * 0.05}
                />
              ))}
            </div>
          </div>

            <div className="lane lane-filtered">
            <div className="lane-header">
              <h2>Filtered News</h2>
              <span>{filteredNews.length}</span>
            </div>
            <p className="lane-caption">Only Awards, Schemes, Science</p>
            {filteredNews.length ? (
              <div key={`filtered-${filterCycle}`} className="card-stack">
                {filteredNews.map((item, index) => (
                  <NewsCard
                    key={`filtered-${item.id}-${filterCycle}`}
                    item={item}
                    showTrust={false}
                    surfaceTone="filtered"
                    animateClass="animate-filtered"
                    delay={index * 0.08}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">Run AI Filter to move relevant items here.</div>
            )}
          </div>

            <div className="lane lane-verified">
            <div className="lane-header">
              <h2>Verified Output</h2>
              <span>{verifiedNews.length}</span>
            </div>
            <p className="lane-caption">Trust score decisions: publish, review, reject</p>
            {verifiedNews.length ? (
              <div key={`verified-${verifyCycle}`} className="card-stack">
                {verifiedNews.map((item, index) => (
                  <NewsCard
                    key={`verified-${item.id}-${verifyCycle}`}
                    item={item}
                    surfaceTone="verified"
                    animateClass="animate-verified"
                    delay={index * 0.1}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">Run Verify Trust after filtering.</div>
            )}
          </div>
          </section>
        </>
      ) : null}

      {activeTab === "quiz" ? (
        <section className="section-panel">
          <div className="panel-header">
            <h2>Quiz Page</h2>
            <span>Source: {stagedItems.source}</span>
          </div>
          <p className="panel-caption">
            MCQs are now isolated on this page, separate from raw/filter pipeline cards.
          </p>
          <div className="wide-grid">
            {stagedItems.items.map((item, index) => (
              <NewsCard
                key={`quiz-${item.id}-${activeTab}`}
                item={item}
                showQuiz
                surfaceTone="filtered"
                animateClass="animate-filtered"
                delay={index * 0.06}
              />
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "notes" ? (
        <section className="section-panel">
          <div className="panel-header">
            <h2>Notes + Static GK Page</h2>
            <span>Source: {stagedItems.source}</span>
          </div>
          <p className="panel-caption">
            Static GK is shown here, and notes appear after clicking <strong>Generate Notes</strong>.
          </p>
          {!notesGenerated ? (
            <div className="empty-state">Click "Generate Notes" to reveal short notes in this page.</div>
          ) : null}
          <div className="wide-grid">
            {stagedItems.items.map((item, index) => (
              <NewsCard
                key={`notes-${item.id}-${notesGenerated}`}
                item={item}
                showNotes={notesGenerated}
                showStaticGk
                surfaceTone="verified"
                animateClass="animate-verified"
                delay={index * 0.06}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default App;
