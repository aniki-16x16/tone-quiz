import test from "node:test";
import assert from "node:assert/strict";
import { CHORD_LEVELS, DEFAULT_CHORD_CONFIG, createChordQuestion, getChordPool, judgeChord, parseChordConfig } from "../src/chords.ts";
import { MidiNoteGate, parseMidiNote } from "../src/midi.ts";
import { startPractice, practiceReducer } from "../src/practice.ts";

const config = DEFAULT_CHORD_CONFIG;
const cMajor = () => createChordQuestion(config, undefined, () => 0);
const frame = (state, notes, noteOn) => practiceReducer(state, {
  type: "chord", notes, noteOn, previousId: state.question.id,
});

test("chord degrees stay relative across all 24 keys and all four levels", () => {
  for (const mode of ["major", "minor"]) {
    for (const level of Object.keys(CHORD_LEVELS)) {
      const reference = getChordPool({ ...config, mode, level });
      for (let tonic = 0; tonic < 12; tonic++) {
        const transposed = getChordPool({ ...config, tonic, mode, level });
        assert.equal(transposed.length, reference.length);
        transposed.forEach((chord, index) => {
          const original = reference[index];
          assert.equal(chord.label, original.label);
          assert.equal(chord.rootDegree, original.rootDegree);
          assert.equal(chord.bassDegree, original.bassDegree);
          assert.equal(chord.quality, original.quality);
          assert.equal(chord.root, (original.root + tonic) % 12);
          assert.equal(chord.bass, (original.bass + tonic) % 12);
          assert.deepEqual(chord.tones, original.tones.map(n => (n + tonic) % 12));
          assert(!/[A-G]/.test(chord.label));
        });
      }
    }
  }
});

test("minor degrees and slash basses use the same major-scale baseline as single notes", () => {
  const minor = getChordPool({ ...config, mode: "minor", level: "color" });
  const slash = minor.find(chord => chord.label === "♭3maj7/5");
  assert.equal(slash.root, 3);
  assert.equal(slash.bass, 7);
  assert(minor.some(chord => chord.label === "♭6maj7"));
  assert(minor.some(chord => chord.label === "♭77"));
  const major = getChordPool({ ...config, tonic: 2, level: "altered" });
  const inversion = major.find(chord => chord.label === "1maj7/3");
  assert.equal(inversion.root, 2);
  assert.equal(inversion.bass, 6);
  const altered = major.find(chord => chord.label === "1maj7(♯11)/♯4");
  assert.equal(altered.bass, 8);
  assert.equal(altered.quality, "maj7(♯11)");
  const sixNine = major.find(chord => chord.label === "16/9/3");
  assert.equal(sixNine.quality, "6/9");
  assert.equal(sixNine.bassDegree, "3");
});

test("24 keys generate all seven diatonic triads and sevenths using their own scale", () => {
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"]) {
      const pool = getChordPool({ ...config, tonic, mode });
      assert.equal(pool.length, 14);
      const scale = (mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).map(n => (n + tonic) % 12);
      for (const chord of pool) {
        assert(chord.tones.every(n => scale.includes(n)));
        assert.equal(chord.root, chord.bass);
        assert([3, 4].includes(chord.tones.length));
      }
    }
  }
  const c = getChordPool(config);
  assert.deepEqual(c.find(chord => chord.label === "7dim").tones, [11, 2, 5]);
  assert.deepEqual(c.find(chord => chord.label === "7m7♭5").tones, [11, 2, 5, 9]);
  assert(getChordPool({ ...config, tonic: 9, mode: "minor" }).some(chord => chord.label === "5m7"));
});

test("four levels add explicit colors, jazz extensions, and altered tensions cumulatively", () => {
  const pools = Object.keys(CHORD_LEVELS).map(level => getChordPool({ ...config, level, includeSlash: false }));
  for (let index = 1; index < pools.length; index++) {
    const labels = new Set(pools[index].map(chord => chord.label));
    assert(pools[index - 1].every(chord => labels.has(chord.label)));
    assert(pools[index].length > pools[index - 1].length);
  }
  assert.deepEqual(pools[1].find(chord => chord.label === "1sus4").tones, [0, 5, 7]);
  assert.deepEqual(pools[2].find(chord => chord.label === "1maj9").tones, [0, 4, 7, 11, 2]);
  assert.deepEqual(pools[2].find(chord => chord.label === "17(9,13)").tones, [0, 4, 7, 10, 2, 9]);
  assert.deepEqual(pools[3].find(chord => chord.label === "17(♭9,♭13)").tones, [0, 4, 7, 10, 1, 8]);
  assert(!pools[3].some(chord => chord.label.includes("alt")));
});

test("color and slash switches filter their families without emptying the pool", () => {
  const noExtras = getChordPool({ ...config, level: "color", includeColors: false, includeSlash: false, includeChromaticRoots: false });
  assert.equal(noExtras.length, 14);
  const slash = getChordPool({ ...config, level: "color", includeColors: false });
  assert(slash.some(chord => chord.label === "1/3"));
  assert(slash.some(chord => chord.label === "4/5"));
  assert(!slash.some(chord => chord.label.includes("sus")));
  const colors = getChordPool({ ...config, level: "color", includeSlash: false });
  assert(colors.some(chord => chord.label === "16/9"));
  assert(colors.every(chord => chord.root === chord.bass));
});

test("every generated prompt has unique pitch classes and a playable exact answer", () => {
  for (const level of Object.keys(CHORD_LEVELS)) {
    let previous;
    for (let step = 0; step < 120; step++) {
      const question = createChordQuestion({ ...config, level }, previous);
      const { tones, bass } = question.chord;
      assert.equal(new Set(tones).size, tones.length);
      assert(tones.includes(bass));
      assert.equal(judgeChord(question, [36 + bass, ...tones.map(n => 60 + n)]), "correct");
      if (previous) {
        assert.notEqual(question.degree.label, previous.degree.label);
        assert.equal(question.id, previous.id + 1);
      }
      previous = question;
    }
  }
});

test("partials and wrong bass wait silently; only extra pitches are wrong", () => {
  const question = cMajor();
  assert.equal(question.degree.label, "1");
  for (const notes of [[], [60], [60, 64], [64, 67, 72]])
    assert.equal(judgeChord(question, notes), "incomplete");
  assert.equal(judgeChord(question, [36, 55, 64, 72]), "correct");
  assert.equal(judgeChord(question, [48, 60, 64, 67]), "correct");
  assert.equal(judgeChord(question, [60, 61]), "wrong");
  assert.equal(judgeChord(question, [60, 64, 66, 67]), "wrong");
});

test("slash chord checks lowest MIDI note and accepts the specified non-chord bass", () => {
  const slash = getChordPool({ ...config, level: "color" }).find(chord => chord.label === "4/5");
  const question = { id: 1, degree: { label: slash.label }, chord: slash };
  assert.equal(judgeChord(question, [43, 53, 57, 60]), "correct");
  assert.equal(judgeChord(question, [41, 55, 57, 60]), "incomplete");
  assert.equal(judgeChord(question, [43, 53, 57]), "incomplete");
  assert.equal(judgeChord(question, [43, 53, 57, 60, 61]), "wrong");
});

test("MIDI streams collect concurrent notes, not accumulated arpeggios; channel releases are independent", () => {
  const gate = new MidiNoteGate();
  const send = data => gate.receive(parseMidiNote(data));
  send([0x90, 60, 100]);
  send([0x90, 64, 100]);
  assert.equal(judgeChord(cMajor(), gate.notes), "incomplete");
  send([0x90, 67, 100]);
  assert.equal(judgeChord(cMajor(), gate.notes), "correct");
  send([0x91, 60, 100]);
  send([0x80, 60, 0]);
  assert.deepEqual(gate.notes, [60, 64, 67]);
  send([0x81, 60, 0]);
  assert.equal(judgeChord(cMajor(), gate.notes), "incomplete");
  send([0x90, 64, 0]);
  send([0x80, 67, 0]);
  assert.deepEqual(gate.notes, []);
  for (const note of [60, 64, 67]) {
    send([0x90, note, 80]);
    assert.equal(judgeChord(cMajor(), gate.notes), "incomplete");
    send([0x80, note, 0]);
  }
});

test("partial frames do not affect statistics; wrong note is counted on press only and correction can pass", () => {
  const question = cMajor();
  let state = startPractice(question, createChordQuestion(config, question));
  assert.equal(frame(state, [60], 60), state);
  assert.equal(frame(state, [60, 64], 64), state);
  state = frame(state, [60, 64, 66], 66);
  assert.equal(state.errors, 1);
  assert.equal(state.total, 1);
  assert.equal(frame(state, [60, 64, 66, 67], 67), state);
  state = frame(state, [60, 64, 67]);
  assert.equal(state.solved, true);
  assert.equal(state.correct, 0);
  assert.equal(state.total, 1);
  assert.equal(frame(state, [], undefined), state);
});

test("complete chords score once and reject mouse/single-note and stale-question submissions", () => {
  const question = cMajor();
  const initial = startPractice(question, createChordQuestion(config, question));
  assert.equal(practiceReducer(initial, { type: "answer", note: 60 }), initial);
  assert.equal(practiceReducer(initial, { type: "chord", notes: [60, 64, 67], noteOn: 67, previousId: 999 }), initial);
  const solved = frame(initial, [60, 64, 67], 67);
  assert.equal(solved.solved, true);
  assert.equal(solved.total, 1);
  assert.equal(solved.correct, 1);
  assert.equal(frame(solved, [60, 64, 67], 67), solved);
});

test("chord configuration validates storage independently from single-note preferences", () => {
  assert.deepEqual(parseChordConfig(null), config);
  assert.deepEqual(parseChordConfig({ tonic: -1, mode: "bad", level: "toString", includeColors: "yes" }), config);
  assert.deepEqual(parseChordConfig({ tonic: 9, mode: "minor", level: "altered", includeColors: false, includeSlash: false, includeChromaticRoots: false }),
    { tonic: 9, mode: "minor", level: "altered", includeColors: false, includeSlash: false, includeChromaticRoots: false });
});

test("chromatic roots start at level two, cover twelve roots, and remain independently switchable", () => {
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"]) {
      const scale = (mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).map(n => (n + tonic) % 12);
      for (const level of Object.keys(CHORD_LEVELS)) {
        const settings = { ...config, tonic, mode, level, includeColors: false, includeSlash: false };
        const off = getChordPool({ ...settings, includeChromaticRoots: false });
        const on = getChordPool({ ...settings, includeChromaticRoots: true });
        assert.deepEqual(new Set(off.map(chord => chord.root)), new Set(scale));
        if (level === "diatonic") assert.deepEqual(on, off);
        else {
          assert.equal(new Set(on.map(chord => chord.root)).size, 12);
          for (const root of Array.from({ length: 12 }, (_, n) => n).filter(n => !scale.includes(n))) {
            assert(on.some(chord => chord.root === root && chord.quality === ""));
            assert(on.some(chord => chord.root === root && chord.quality === "maj7"));
          }
          assert(off.every(chord => on.some(candidate => candidate.label === chord.label)));
        }
      }
    }
  }
  const pool = getChordPool({ ...config, level: "color" });
  assert(pool.some(chord => chord.label === "♭3"));
  assert(pool.some(chord => chord.label === "♭6maj7"));
  assert(pool.some(chord => chord.label === "♭7"));
  assert(pool.some(chord => chord.label === "♯4sus4"));
  assert(pool.some(chord => chord.label === "♭3maj7/5"));
  assert.equal(parseChordConfig({ level: "color" }).includeChromaticRoots, true);
});
