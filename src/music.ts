export const NOTE_NAMES = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

export type Mode = "major" | "minor";
export type Difficulty = "diatonic" | "chromatic";
export type QuizConfig = { tonic: number; mode: Mode; difficulty: Difficulty };
export type Preferences = QuizConfig & { autoAdvance: boolean; sound: boolean };
export type Degree = { label: string; semitones: number; interval: string };
export type Question = { id: number; degree: Degree; answer: number };

export const DEFAULT_PREFERENCES: Preferences = {
  tonic: 0,
  mode: "major",
  difficulty: "diatonic",
  autoAdvance: true,
  sound: true,
};
export const MODE_NAMES: Record<Mode, string> = {
  major: "自然大调",
  minor: "自然小调",
};
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  diatonic: "调内音",
  chromatic: "加入调外音",
};

const degree = (
  label: string,
  semitones: number,
  interval: string,
): Degree => ({ label, semitones, interval });
const MAJOR = [
  degree("1", 0, "纯一度"),
  degree("2", 2, "大二度"),
  degree("3", 4, "大三度"),
  degree("4", 5, "纯四度"),
  degree("5", 7, "纯五度"),
  degree("6", 9, "大六度"),
  degree("7", 11, "大七度"),
];
const MINOR = [
  degree("1", 0, "纯一度"),
  degree("2", 2, "大二度"),
  degree("♭3", 3, "小三度"),
  degree("4", 5, "纯四度"),
  degree("5", 7, "纯五度"),
  degree("♭6", 8, "小六度"),
  degree("♭7", 10, "小七度"),
];

// Keep interval identity on questions; normalize only the answered pitch.
const ALTERED = [
  degree("♭2", 1, "小二度"),
  degree("♭9", 13, "小九度"),
  degree("♭3", 3, "小三度"),
  degree("♯9", 15, "增九度"),
  degree("3", 4, "大三度"),
  degree("♯4", 6, "增四度"),
  degree("♭5", 6, "减五度"),
  degree("♯11", 18, "增十一度"),
  degree("♯5", 8, "增五度"),
  degree("♭6", 8, "小六度"),
  degree("♭13", 20, "小十三度"),
  degree("6", 9, "大六度"),
  degree("13", 21, "大十三度"),
  degree("♭7", 10, "小七度"),
  degree("7", 11, "大七度"),
];

export function pitchClass(note: number): number {
  return ((note % 12) + 12) % 12;
}

export function getQuestionGroups(config: QuizConfig): Degree[][] {
  const scale = config.mode === "major" ? MAJOR : MINOR;
  const groups = scale.map((item) => [item]);
  if (config.difficulty === "diatonic") return groups;
  const inScale = new Set(scale.map((item) => item.semitones));
  for (let pitch = 0; pitch < 12; pitch++) {
    if (!inScale.has(pitch))
      groups.push(
        ALTERED.filter((item) => pitchClass(item.semitones) === pitch),
      );
  }
  return groups;
}

export function createQuestion(
  config: QuizConfig,
  previous?: Question,
  random = Math.random,
): Question {
  // Sample pitches first so enharmonic spellings do not overweight one pitch.
  const groups = getQuestionGroups(config).filter(
    (group) =>
      !previous ||
      pitchClass(config.tonic + group[0].semitones) !== previous.answer,
  );
  const group =
    groups[Math.min(groups.length - 1, Math.floor(random() * groups.length))];
  const selected =
    group[Math.min(group.length - 1, Math.floor(random() * group.length))];
  return {
    id: previous ? previous.id + 1 : 1,
    degree: selected,
    answer: pitchClass(config.tonic + selected.semitones),
  };
}

export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_PREFERENCES };
  const candidate = value as Partial<Preferences>;
  return {
    tonic:
      Number.isInteger(candidate.tonic) &&
      candidate.tonic! >= 0 &&
      candidate.tonic! < 12
        ? candidate.tonic!
        : 0,
    mode: candidate.mode === "minor" ? "minor" : "major",
    difficulty: candidate.difficulty === "chromatic" ? "chromatic" : "diatonic",
    autoAdvance:
      typeof candidate.autoAdvance === "boolean" ? candidate.autoAdvance : true,
    sound: typeof candidate.sound === "boolean" ? candidate.sound : true,
  };
}
