import { pitchClass } from "./music.ts";
import type { Question } from "./music.ts";

export type PracticeState = {
  question: Question;
  attempts: number;
  solved: boolean;
  lastAnswer: number | null;
  errors: number;
  total: number;
  correct: number;
  streak: number;
};
export type PracticeAction =
  | { type: "answer"; note: number }
  | { type: "next"; question: Question; previousId: number }
  | { type: "restart"; question: Question };

export function startPractice(question: Question): PracticeState {
  return {
    question,
    attempts: 0,
    solved: false,
    lastAnswer: null,
    errors: 0,
    total: 0,
    correct: 0,
    streak: 0,
  };
}

export function practiceReducer(
  state: PracticeState,
  action: PracticeAction,
): PracticeState {
  if (action.type === "restart") return startPractice(action.question);
  if (action.type === "next") {
    if (!state.solved || action.previousId !== state.question.id) return state;
    return {
      ...state,
      question: action.question,
      attempts: 0,
      solved: false,
      lastAnswer: null,
    };
  }
  if (state.solved || !Number.isInteger(action.note)) return state;
  const answer = pitchClass(action.note);
  const solved = answer === state.question.answer;
  const firstAttempt = state.attempts === 0;
  return {
    ...state,
    attempts: state.attempts + 1,
    lastAnswer: answer,
    solved,
    errors: state.errors + (solved ? 0 : 1),
    total: state.total + (firstAttempt ? 1 : 0),
    correct: state.correct + (firstAttempt && solved ? 1 : 0),
    streak: !solved ? 0 : firstAttempt ? state.streak + 1 : state.streak,
  };
}
