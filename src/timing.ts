// Shared by the voice envelope and note feedback, independently of sound mute.
export const NOTE_TIMING = {
  attack: 0.01,
  hold: 0.5,
  decayKnee: 1.1,
  decayEnd: 1.65,
  end: 1.7,
  retriggerRelease: 0.08,
  feedbackMs: 1200,
  answerMs: 260,
  transitionMs: 180,
} as const;
