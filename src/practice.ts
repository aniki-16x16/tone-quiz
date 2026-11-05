import { pitchClass } from "./music.ts";
import type { Question } from "./music.ts";
import { judgeChord } from "./chords.ts";

export type PracticeState = {
  question: Question;
  nextQuestion: Question;
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
  | { type: "chord"; notes: readonly number[]; noteOn?: number; previousId: number }
  | { type: "next"; nextQuestion: Question; previousId: number }
  | { type: "restart"; question: Question; nextQuestion: Question };

export function startPractice(
  question: Question,
  nextQuestion: Question,
): PracticeState {
  return {
    question,
    nextQuestion,
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
  if (action.type === "restart")
    return startPractice(action.question, action.nextQuestion);
  if (action.type === "next") {
    if (!state.solved || action.previousId !== state.question.id) return state;
    return {
      ...state,
      question: state.nextQuestion,
      nextQuestion: action.nextQuestion,
      attempts: 0,
      solved: false,
      lastAnswer: null,
    };
  }
  if (state.solved) return state;
  let answer: number;
  let solved: boolean;
  if (action.type === "chord") {
    if (!state.question.chord || action.previousId !== state.question.id) return state;
    const result = judgeChord(state.question, action.notes);
    if (result === "incomplete") return state;
    if (result === "wrong" && (action.noteOn === undefined ||
      state.question.chord.tones.includes(pitchClass(action.noteOn)))) return state;
    solved = result === "correct";
    answer = solved ? state.question.answer : pitchClass(action.noteOn!);
  } else {
    if (state.question.chord || !Number.isInteger(action.note)) return state;
    answer = pitchClass(action.note);
    solved = answer === state.question.answer;
  }
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
