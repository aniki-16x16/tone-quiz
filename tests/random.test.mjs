import test from "node:test";
import assert from "node:assert/strict";
import { BalancedSampler, SeededRandom } from "../src/random.ts";
import { createQuestion, getQuestionGroups } from "../src/music.ts";
import { CHORD_LEVELS, DEFAULT_CHORD_CONFIG, createChordQuestion, getChordPool } from "../src/chords.ts";
import { practiceReducer, startPractice } from "../src/practice.ts";

function count(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}
function balanced(items, choices) {
  const counts = count(items);
  const values = choices.map(choice => counts.get(choice) ?? 0);
  assert(Math.max(...values) - Math.min(...values) <= 1);
}

test("custom RNG is reproducible, seed-sensitive, non-degenerate and bounded", () => {
  const sequence = seed => {
    const rng = new SeededRandom(seed);
    return Array.from({ length: 10000 }, () => rng.next());
  };
  const first = sequence(123456);
  assert.deepEqual(first, sequence(123456));
  assert.notDeepEqual(first, sequence(654321));
  assert(first.every(value => value >= 0 && value < 1));
  assert.equal(new Set(first).size, first.length);
  assert(sequence(0).some(value => value > 0));
});

test("shuffle bags exhaust every choice, avoid boundary repeats and do not mutate snapshots", () => {
  for (let seed = 0; seed < 40; seed++) {
    const sampler = new BalancedSampler("test", undefined, seed);
    const choices = ["a", "b", "c", "d"];
    let previous;
    for (let round = 0; round < 25; round++) {
      const drawn = [];
      for (let i = 0; i < choices.length; i++) {
        const next = sampler.take("letters", choices, previous);
        assert.notEqual(next, previous);
        drawn.push(next);
        previous = next;
      }
      assert.deepEqual(new Set(drawn), new Set(choices));
    }
    const snapshot = sampler.snapshot();
    const original = structuredClone(snapshot);
    const a = new BalancedSampler("test", snapshot);
    const b = new BalancedSampler("test", snapshot);
    assert.equal(a.take("letters", choices), b.take("letters", choices));
    a.take("letters", choices);
    assert.deepEqual(snapshot, original);
  }
});

test("single-note rounds cover every pitch once in all 24 keys and both difficulties", () => {
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"]) {
      for (const difficulty of ["diatonic", "chromatic"]) {
        const config = { tonic, mode, difficulty };
        const size = difficulty === "diatonic" ? 7 : 12;
        let previous;
        const spellings = new Map();
        for (let round = 0; round < 10; round++) {
          const answers = [];
          for (let i = 0; i < size; i++) {
            const question = createQuestion(config, previous, 20261106);
            if (previous) assert.notEqual(question.answer, previous.answer);
            answers.push(question.answer);
            const labels = spellings.get(question.answer) ?? [];
            labels.push(question.degree.label);
            spellings.set(question.answer, labels);
            previous = question;
          }
          assert.equal(new Set(answers).size, size);
        }
        for (const group of getQuestionGroups(config)) {
          const pitch = (tonic + group[0].semitones) % 12;
          balanced(spellings.get(pitch), group.map(degree => degree.label));
        }
      }
    }
  }
});

test("chord roots, qualities, position types and slash basses remain balanced", () => {
  for (const mode of ["major", "minor"]) {
    for (const level of Object.keys(CHORD_LEVELS)) {
      for (const includeChromaticRoots of [true, false]) {
        const config = { ...DEFAULT_CHORD_CONFIG, mode, level, includeChromaticRoots };
        const pool = getChordPool(config);
        const roots = [...new Set(pool.map(chord => chord.root))];
        const qualities = new Map();
        const positions = new Map();
        const basses = new Map();
        let previous;
        for (let round = 0; round < 20; round++) {
          const drawnRoots = [];
          for (let i = 0; i < roots.length; i++) {
            const question = createChordQuestion(config, previous, 8675309);
            if (previous) assert.notEqual(question.answer, previous.answer);
            const chord = question.chord;
            drawnRoots.push(chord.root);
            const entries = qualities.get(chord.root) ?? [];
            entries.push(chord.quality);
            qualities.set(chord.root, entries);
            const key = `${chord.root}:${chord.quality}`;
            const types = positions.get(key) ?? [];
            types.push(chord.bass === chord.root ? "root" : "slash");
            positions.set(key, types);
            if (chord.bass !== chord.root) {
              const notes = basses.get(key) ?? [];
              notes.push(chord.bass);
              basses.set(key, notes);
            }
            previous = question;
          }
          assert.deepEqual(new Set(drawnRoots), new Set(roots));
        }
        for (const root of roots) {
          const available = [...new Set(pool.filter(chord => chord.root === root).map(chord => chord.quality))];
          balanced(qualities.get(root), available);
          for (const quality of available) {
            const key = `${root}:${quality}`;
            const slash = pool.filter(chord => chord.root === root && chord.quality === quality && chord.bass !== root);
            if (positions.has(key)) balanced(positions.get(key), slash.length ? ["root", "slash"] : ["root"]);
            if (basses.has(key)) balanced(basses.get(key), slash.map(chord => chord.bass));
          }
        }
      }
    }
  }
});

test("diatonic chord practice covers all fourteen root-position prompts every fourteen questions", () => {
  let previous;
  for (let round = 0; round < 30; round++) {
    const labels = [];
    for (let i = 0; i < 14; i++) {
      previous = createChordQuestion(DEFAULT_CHORD_CONFIG, previous, 314159);
      labels.push(previous.degree.label);
    }
    assert.equal(new Set(labels).size, 14);
  }
});

test("preview generation is replayable, stale actions cannot consume draws, and settings reset bags", () => {
  const config = { tonic: 0, mode: "major", difficulty: "chromatic" };
  const question = createQuestion(config, undefined, 42);
  const preview = createQuestion(config, question);
  const original = structuredClone(preview);
  const future = createQuestion(config, preview);
  assert.deepEqual(createQuestion(config, preview), future);
  assert.deepEqual(preview, original);
  let session = startPractice(question, preview);
  session = practiceReducer(session, { type: "answer", note: question.answer });
  const action = { type: "next", nextQuestion: future, previousId: question.id };
  session = practiceReducer(session, action);
  assert.equal(session.question, preview);
  assert.equal(practiceReducer(session, action), session);
  const changed = createQuestion({ ...config, difficulty: "diatonic" }, preview, 42);
  assert.notEqual(changed.sequence.scope, preview.sequence.scope);
  assert.equal(changed.sequence.bags.pitches.length, 6);
  const chord = createChordQuestion(DEFAULT_CHORD_CONFIG, undefined, 42);
  const chordPreview = createChordQuestion(DEFAULT_CHORD_CONFIG, chord);
  assert.deepEqual(createChordQuestion(DEFAULT_CHORD_CONFIG, chord), chordPreview);
});
