import { useEffect, useMemo, useState } from "react";

function deterministicShuffle(items, seedText) {
  const output = [...items];
  let seed = 0;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = (seed * 31 + seedText.charCodeAt(index)) >>> 0;
  }
  for (let index = output.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function sanitizeQuizText(value) {
  const raw = String(value || "");
  const cleaned = raw
    .replace(/\bTitle:\s*/gi, "")
    .replace(/\bDescription:\s*/gi, " ")
    .replace(/\bContent:\s*/gi, " ")
    .replace(/\bSource:\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw;
}

export function QuizPanel({ question, onComplete, showFeedback = true }) {
  const [selected, setSelected] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const shuffledOptions = useMemo(() => {
    const options = Array.isArray(question?.options) ? question.options : [];
    const seed = `${question?.question || ""}|${question?.answer || ""}|${options.join("|")}`;
    const randomized = deterministicShuffle(options, seed);
    if (randomized[0] === question?.answer && randomized.length > 1) {
      return [...randomized.slice(1), randomized[0]];
    }
    return randomized;
  }, [question?.answer, question?.options, question?.question]);

  useEffect(() => {
    setSelected("");
    setSubmitted(false);
  }, [question?.question]);

  const isCorrect = useMemo(
    () => submitted && selected && selected === question.answer,
    [question.answer, selected, submitted]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selected) {
      return;
    }
    setSubmitted(true);
    if (onComplete) {
      onComplete({
        isCorrect: selected === question.answer,
        selected,
        answer: question.answer,
        score: selected === question.answer ? 100 : 0,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">MCQ</p>
      <h3 className="mt-2 font-display text-lg font-semibold text-slate-900">{question.question}</h3>

      <div className="mt-4 grid gap-2">
        {shuffledOptions.map((option, index) => (
          <label
            key={`${option}-${index}`}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${
              selected === option ? "border-sky-400 bg-sky-50" : "border-slate-200"
            }`}
          >
            <input
              type="radio"
              name="mcq-option"
              value={option}
              checked={selected === option}
              onChange={(event) => setSelected(event.target.value)}
              className="mt-0.5"
            />
            <span>{sanitizeQuizText(option)}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!selected}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Check Answer
        </button>
        {submitted && showFeedback ? (
          <span className={`text-sm font-semibold ${isCorrect ? "text-emerald-600" : "text-rose-600"}`}>
            {isCorrect ? "Correct" : "Incorrect"}
          </span>
        ) : null}
      </div>

      {submitted && showFeedback ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            <strong>Correct answer:</strong> {sanitizeQuizText(question.answer)}
          </p>
          <p className="mt-1">{question.explanation}</p>
        </div>
      ) : null}
    </form>
  );
}
