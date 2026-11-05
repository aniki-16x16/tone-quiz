import test from "node:test";
import assert from "node:assert/strict";
import {
  createQuestion,
  getQuestionGroups,
  parsePreferences,
  pitchClass,
} from "../src/music.ts";
import { startPractice, practiceReducer } from "../src/practice.ts";
import { MidiNoteGate, parseMidiNote } from "../src/midi.ts";

const config = { tonic: 0, mode: "major", difficulty: "diatonic" };
const question = {
  id: 1,
  degree: { label: "♭3", semitones: 3, interval: "小三度" },
  answer: 3,
};
const answer = (state, note) =>
  practiceReducer(state, { type: "answer", note });

test("all 24 keys contain exactly their seven diatonic pitches; advanced covers all twelve", () => {
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"]) {
      const offsets =
        mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
      const basic = getQuestionGroups({ tonic, mode, difficulty: "diatonic" });
      assert.deepEqual(
        basic.map(([item]) => pitchClass(tonic + item.semitones)),
        offsets.map((n) => (n + tonic) % 12),
      );
      const advanced = getQuestionGroups({
        tonic,
        mode,
        difficulty: "chromatic",
      });
      assert.equal(advanced.length, 12);
      assert.equal(
        new Set(advanced.map(([item]) => pitchClass(item.semitones))).size,
        12,
      );
      assert(advanced.every((group) => group.length > 0));
    }
  }
});

test("minor degrees use interval labels instead of renumbering the lowered notes", () => {
  assert.deepEqual(
    getQuestionGroups({ ...config, mode: "minor" }).map(([d]) => d.label),
    ["1", "2", "♭3", "4", "5", "♭6", "♭7"],
  );
});

test("altered prompts retain sharp extensions while answers ignore their octave", () => {
  const groups = getQuestionGroups({ ...config, difficulty: "chromatic" });
  const sharp9 = groups.flat().find((item) => item.label === "♯9");
  const sharp11 = groups.flat().find((item) => item.label === "♯11");
  assert.equal(sharp9.semitones, 15);
  assert.equal(sharp11.semitones, 18);
  for (const note of [3, 15, 27, 39, 51, 63, 75, 87, 99, 111, 123]) {
    assert.equal(
      answer(startPractice({ ...question, degree: sharp9 }), note).solved,
      true,
    );
  }
});

test("advanced minor only adds pitch classes outside the natural minor scale", () => {
  const extra = getQuestionGroups({
    ...config,
    mode: "minor",
    difficulty: "chromatic",
  }).slice(7);
  assert.deepEqual(
    extra.map(([item]) => pitchClass(item.semitones)),
    [1, 4, 6, 9, 11],
  );
  assert(!extra.flat().some((item) => item.label === "♯9"));
});

test("question generation transposes correctly and never repeats the previous answer", () => {
  let previous;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (let i = 0; i < 24; i++) {
      const current = createQuestion(
        { ...config, tonic, difficulty: "chromatic" },
        previous,
      );
      assert.equal(
        current.answer,
        pitchClass(tonic + current.degree.semitones),
      );
      if (previous) assert.notEqual(current.answer, previous.answer);
      previous = current;
    }
  }
});

test("a wrong answer stays on the question; retries do not repair first-attempt statistics", () => {
  let state = startPractice(question);
  state = answer(state, 4);
  assert.equal(state.question, question);
  assert.equal(state.solved, false);
  assert.equal(state.total, 1);
  assert.equal(state.correct, 0);
  state = answer(state, 5);
  state = answer(state, 75);
  assert.equal(state.solved, true);
  assert.equal(state.total, 1);
  assert.equal(state.correct, 0);
  assert.equal(state.errors, 2);
  assert.equal(state.streak, 0);
});

test("completed questions ignore duplicate inputs and count one first-attempt success", () => {
  const state = answer(startPractice(question), 63);
  assert.equal(state.correct, 1);
  assert.equal(state.streak, 1);
  assert.equal(answer(state, 3), state);
  assert.equal(answer(state, 7), state);
});

test("only solved questions advance and stale advance actions cannot skip a question", () => {
  const initial = startPractice(question);
  const nextQuestion = { ...question, id: 2, answer: 7 };
  const next = { type: "next", question: nextQuestion, previousId: 1 };
  assert.equal(practiceReducer(initial, next), initial);
  const solved = answer(initial, 3);
  const advanced = practiceReducer(solved, next);
  assert.equal(advanced.question, nextQuestion);
  assert.equal(advanced.attempts, 0);
  assert.equal(advanced.total, 1);
  const secondSolved = answer(advanced, 7);
  assert.equal(practiceReducer(secondSolved, next), secondSolved);
});

test("changing quiz settings starts a fresh session", () => {
  const state = practiceReducer(answer(startPractice(question), 4), {
    type: "restart",
    question: { ...question, id: 2 },
  });
  assert.equal(state.total, 0);
  assert.equal(state.attempts, 0);
  assert.equal(state.errors, 0);
  assert.equal(state.solved, false);
});

test("stored preferences are validated rather than allowing invalid keys or types", () => {
  assert.equal(
    parsePreferences({ tonic: 100, mode: "unknown", autoAdvance: "no" }).tonic,
    0,
  );
  assert.equal(parsePreferences(null).autoAdvance, true);
  assert.deepEqual(
    parsePreferences({
      tonic: 8,
      mode: "minor",
      difficulty: "chromatic",
      autoAdvance: false,
      sound: false,
    }),
    {
      tonic: 8,
      mode: "minor",
      difficulty: "chromatic",
      autoAdvance: false,
      sound: false,
    },
  );
});

test("MIDI note parsing handles channels and velocity-zero note-off and ignores pedals", () => {
  assert.deepEqual(parseMidiNote([0x92, 63, 80]), {
    kind: "on",
    channel: 2,
    note: 63,
  });
  assert.deepEqual(parseMidiNote([0x92, 63, 0]), {
    kind: "off",
    channel: 2,
    note: 63,
  });
  assert.deepEqual(parseMidiNote([0x82, 63, 64]), {
    kind: "off",
    channel: 2,
    note: 63,
  });
  assert.equal(parseMidiNote([0xb0, 64, 127]), null);
  assert.equal(parseMidiNote([0xf8]), null);
});

test("MIDI held notes and chords only submit one note until every key is released", () => {
  const gate = new MidiNoteGate();
  const on = (note, channel = 0) => gate.receive({ kind: "on", note, channel });
  const off = (note, channel = 0) =>
    gate.receive({ kind: "off", note, channel });
  assert.deepEqual(on(63), { submit: true, held: true });
  assert.equal(on(63).submit, false);
  assert.equal(on(75, 1).submit, false);
  assert.equal(off(63).held, true);
  assert.equal(on(67).submit, false);
  assert.equal(off(75, 1).held, true);
  assert.equal(off(67).held, false);
  assert.equal(on(87).submit, true);
});
