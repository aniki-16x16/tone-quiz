import { getAnswerNoteNames, pitchClass } from "./music.ts";
import type { Mode, Question } from "./music.ts";

export const CHORD_LEVELS = {
  diatonic: "01 · 调内三／七和弦",
  color: "02 · 进阶和弦",
  jazz: "03 · 常见爵士扩展",
  altered: "04 · 变化 tension",
} as const;
export type ChordLevel = keyof typeof CHORD_LEVELS;
export type ChordConfig = {
  tonic: number;
  mode: Mode;
  level: ChordLevel;
  includeColors: boolean;
  includeSlash: boolean;
  includeChromaticRoots: boolean;
};
export const DEFAULT_CHORD_CONFIG: ChordConfig = {
  tonic: 0,
  mode: "major",
  level: "diatonic",
  includeColors: true,
  includeSlash: true,
  includeChromaticRoots: true,
};

export function parseChordConfig(value: unknown): ChordConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_CHORD_CONFIG };
  const config = value as Partial<ChordConfig>;
  return {
    tonic: Number.isInteger(config.tonic) && config.tonic! >= 0 && config.tonic! < 12
      ? config.tonic! : 0,
    mode: config.mode === "minor" ? "minor" : "major",
    level: config.level && Object.hasOwn(CHORD_LEVELS, config.level)
      ? config.level : "diatonic",
    includeColors: typeof config.includeColors === "boolean" ? config.includeColors : true,
    includeSlash: typeof config.includeSlash === "boolean" ? config.includeSlash : true,
    includeChromaticRoots: typeof config.includeChromaticRoots === "boolean" ? config.includeChromaticRoots : true,
  };
}

type Shape = { suffix: string; intervals: number[] };
const shape = (suffix: string, ...intervals: number[]): Shape => ({ suffix, intervals });
const BASIC_SHAPES = [
  shape("", 0, 4, 7), shape("m", 0, 3, 7), shape("dim", 0, 3, 6),
  shape("maj7", 0, 4, 7, 11), shape("m7", 0, 3, 7, 10),
  shape("7", 0, 4, 7, 10), shape("m7♭5", 0, 3, 6, 10),
];
const COLOR_SHAPES = [
  shape("sus2", 0, 2, 7), shape("sus4", 0, 5, 7),
  shape("add9", 0, 4, 7, 14), shape("m(add9)", 0, 3, 7, 14),
  shape("6", 0, 4, 7, 9), shape("m6", 0, 3, 7, 9),
  shape("6/9", 0, 4, 7, 9, 14),
];
const JAZZ_SHAPES = [
  shape("maj9", 0, 4, 7, 11, 14), shape("m9", 0, 3, 7, 10, 14),
  shape("9", 0, 4, 7, 10, 14), shape("m11", 0, 3, 7, 10, 14, 17),
  // Explicit tensions avoid ambiguity about the natural 11 in a dominant 13.
  shape("7(9,13)", 0, 4, 7, 10, 14, 21),
];
const ALTERED_SHAPES = [
  shape("7(♭9)", 0, 4, 7, 10, 13), shape("7(♯9)", 0, 4, 7, 10, 15),
  shape("7(♯11)", 0, 4, 7, 10, 18), shape("7(♭13)", 0, 4, 7, 10, 20),
  shape("7(♭9,♭13)", 0, 4, 7, 10, 13, 20),
  shape("7(♯9,♭13)", 0, 4, 7, 10, 15, 20),
  shape("maj7(♯11)", 0, 4, 7, 11, 18),
];

// Match single-note practice: degrees are measured against the tonic's major
// scale, so natural minor retains ♭3, ♭6 and ♭7 rather than renumbering them.
const ROOT_DEGREES = ["1", "♭2", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"];
type Candidate = {
  label: string;
  root: number;
  bass: number;
  rootDegree: string;
  bassDegree: string;
  quality: string;
  tones: number[];
};
export function getChordPool(config: ChordConfig): Candidate[] {
  const scale = config.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const degreeName = (pitch: number) => ROOT_DEGREES[pitchClass(pitch - config.tonic)];
  const pool: Candidate[] = [];
  function add(root: number, voicing: Shape) {
    pool.push({
      label: `${degreeName(root)}${voicing.suffix}`,
      rootDegree: degreeName(root), bassDegree: degreeName(root), quality: voicing.suffix,
      root, bass: root,
      tones: voicing.intervals.map(n => pitchClass(root + n)),
    });
  }
  // Build diatonic thirds from the selected scale, including natural-minor v7.
  scale.forEach((offset, index) => {
    for (const size of [3, 4]) {
      const intervals = Array.from({ length: size }, (_, voice) =>
        pitchClass(scale[(index + voice * 2) % 7] - offset));
      const voicing = BASIC_SHAPES.find(item =>
        item.intervals.length === size && item.intervals.every((n, i) => n === intervals[i]));
      if (voicing) add(pitchClass(config.tonic + offset), voicing);
    }
  });
  if (config.level !== "diatonic") {
    const roots = config.includeChromaticRoots
      ? Array.from({ length: 12 }, (_, pitch) => pitch) : scale;
    // Keep the key's original triads/sevenths, adding basic chord qualities on
    // the five out-of-scale roots before adding this level's extra families.
    for (const offset of roots) {
      if (!scale.includes(offset))
        for (const voicing of BASIC_SHAPES) add(pitchClass(config.tonic + offset), voicing);
    }
    const additions = [
      ...(config.includeColors ? COLOR_SHAPES : []),
      ...(config.level === "jazz" || config.level === "altered" ? JAZZ_SHAPES : []),
      ...(config.level === "altered" ? ALTERED_SHAPES : []),
    ];
    for (const offset of roots)
      for (const voicing of additions) add(pitchClass(config.tonic + offset), voicing);
    if (config.includeSlash) {
      // Include chord-tone inversions and diatonic non-chord basses (e.g. F/G).
      for (const chord of [...pool]) {
        const basses = new Set([...chord.tones, ...scale.map(n => pitchClass(config.tonic + n))]);
        for (const bass of basses) {
          if (bass === chord.root) continue;
          pool.push({ ...chord, label: `${chord.label}/${degreeName(bass)}`, bass,
            bassDegree: degreeName(bass),
            tones: [...new Set([...chord.tones, bass])] });
        }
      }
    }
  }
  return pool;
}

export function createChordQuestion(
  config: ChordConfig, previous?: Question, random = Math.random,
): Question {
  const pool = getChordPool(config);
  // Sample the bass-independent symbol first, so slash variants do not dominate.
  const groups = new Map<string, Candidate[]>();
  for (const chord of pool) {
    if (chord.label === previous?.degree.label) continue;
    const key = `${chord.root}:${chord.quality}`;
    const group = groups.get(key) ?? [];
    group.push(chord);
    groups.set(key, group);
  }
  const pick = <T,>(items: T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  // Sample roots first, keeping roots with more chord qualities from dominating.
  const rootGroups = new Map<number, Candidate[][]>();
  for (const group of groups.values()) {
    const root = group[0].root;
    const qualities = rootGroups.get(root) ?? [];
    qualities.push(group);
    rootGroups.set(root, qualities);
  }
  const group = pick(pick([...rootGroups.values()]));
  // Half root-position, half slash when enabled; each slash has equal probability.
  const rootPosition = group.find(chord => chord.bass === chord.root);
  const slash = group.filter(chord => chord.bass !== chord.root);
  const selected = rootPosition && (!slash.length || random() < 0.5)
    ? rootPosition : pick(slash.length ? slash : group);
  const names = getAnswerNoteNames(config);
  return {
    id: previous ? previous.id + 1 : 1,
    answer: selected.root,
    degree: { label: selected.label, semitones: pitchClass(selected.root - config.tonic), interval: "和弦" },
    chord: { root: selected.root, bass: selected.bass, tones: selected.tones,
      rootDegree: selected.rootDegree, bassDegree: selected.bassDegree, quality: selected.quality,
      toneNames: selected.tones.map(n => names[n]) },
  };
}

export type ChordResult = "incomplete" | "wrong" | "correct";
export function judgeChord(question: Question, notes: readonly number[]): ChordResult {
  if (!question.chord || !notes.length || notes.some(n => !Number.isInteger(n) || n < 0 || n > 127))
    return "incomplete";
  const pitches = new Set(notes.map(pitchClass));
  if ([...pitches].some(n => !question.chord!.tones.includes(n))) return "wrong";
  if (pitchClass(Math.min(...notes)) !== question.chord.bass) return "incomplete";
  return question.chord.tones.every(n => pitches.has(n)) ? "correct" : "incomplete";
}
