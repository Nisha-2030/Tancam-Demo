import { useMemo, useState } from "react";

export function QuizBlock({ quiz, quizId }) {
  const [selectedOption, setSelectedOption] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const optionName = useMemo(() => `option-${quizId}`, [quizId]);

  if (!quiz) {
    return null;
  }

  const handleOption = (option) => {
    setSelectedOption(option);
    setShowAnswer(true);
  };

  return (
    <div className="quiz-block">
      <p className="quiz-title">MCQ Demo</p>
      <p className="quiz-question">{quiz.question}</p>

      <div className="quiz-options">
        {quiz.options.map((option) => {
          let stateClass = "";

          if (showAnswer && option === quiz.correctAnswer) {
            stateClass = "option-correct";
          } else if (showAnswer && option === selectedOption && option !== quiz.correctAnswer) {
            stateClass = "option-wrong";
          }

          return (
            <label key={option} className={`option-card ${stateClass}`}>
              <input
                type="radio"
                name={optionName}
                checked={selectedOption === option}
                onChange={() => handleOption(option)}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>

      {showAnswer && (
        <div className="quiz-answer">
          <p>
            <strong>Correct Answer:</strong> {quiz.correctAnswer}
          </p>
          <p>{quiz.explanation}</p>
        </div>
      )}
    </div>
  );
}
