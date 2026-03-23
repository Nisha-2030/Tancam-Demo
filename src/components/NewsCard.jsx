import { useState } from "react";
import { QuizBlock } from "./QuizBlock";
import { TrustBadge } from "./TrustBadge";

export function NewsCard({
  item,
  showNotes = false,
  showQuiz = false,
  showStaticGk = false,
  showTrust = true,
  surfaceTone = "default",
  animateClass,
  delay = 0
}) {
  const [showGk, setShowGk] = useState(false);

  return (
    <article
      className={`news-card tone-${surfaceTone} ${animateClass ?? ""}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="news-header">
        <span className="category-chip">{item.category}</span>
        <span className="source-chip">{item.source}</span>
      </div>

      <h3 className="news-title">{item.title}</h3>

      {showTrust ? <TrustBadge score={item.trustScore} /> : null}

      {showStaticGk && item.staticGk?.length ? (
        <div className="gk-block">
          <button className="ghost-btn" onClick={() => setShowGk((prev) => !prev)} type="button">
            {showGk ? "Hide Static GK" : "Show Static GK"}
          </button>
          {showGk && (
            <ul className="gk-list">
              {item.staticGk.map((fact) => (
                <li key={`${item.id}-${fact.label}`}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {showNotes ? (
        <div className="note-box">
          <p className="note-label">Short Note</p>
          <p>{item.note}</p>
        </div>
      ) : null}

      {showQuiz ? <QuizBlock quiz={item.quiz} quizId={`${item.id}-${animateClass ?? "raw"}`} /> : null}
    </article>
  );
}
