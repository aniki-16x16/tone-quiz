import { pitchClass } from "./music.ts";
import { NOTE_TIMING } from "./timing.ts";

export type ToneVoice = { release: () => void };
type VoiceOptions = {
  midi?: boolean;
  destination?: AudioNode;
  onEnded?: () => void;
};

// Both exercise modes share this output, keeping polyphonic peaks controlled
// without reducing the gain of every MIDI note.
export function createToneOutput(context: BaseAudioContext): DynamicsCompressorNode {
  const output = context.createDynamicsCompressor();
  output.threshold.value = -18;
  output.knee.value = 12;
  output.ratio.value = 12;
  output.attack.value = 0.003;
  output.release.value = 0.25;
  output.connect(context.destination);
  return output;
}

// Electric-piano-style voice: warm body + evolving FM tine + mild tremolo.
// All pitch components stay harmonic; tremolo changes volume, never tuning.
export function createMelodyVoice(
  context: BaseAudioContext,
  pitch: number,
  options: VoiceOptions = {},
): ToneVoice {
  const now = context.currentTime;
  const frequency = 440 * 2 ** (((options.midi ? pitch : 60 + pitchClass(pitch)) - 69) / 12);
  const output = context.createGain();
  output.gain.value = 1;
  output.connect(options.destination ?? context.destination);
  const envelope = context.createGain();
  const motion = context.createGain();
  const bodyLevel = context.createGain();
  const tineLevel = context.createGain();
  const modulation = context.createGain();
  const tremoloDepth = context.createGain();
  const body = context.createOscillator();
  const tine = context.createOscillator();
  const modulator = context.createOscillator();
  const tremolo = context.createOscillator();
  const oscillators = [body, tine, modulator, tremolo];
  const nodes = [
    output,
    envelope,
    motion,
    bodyLevel,
    tineLevel,
    modulation,
    tremoloDepth,
  ];
  let remaining = oscillators.length;
  let released = false;

  body.type = "triangle";
  body.frequency.value = frequency;
  bodyLevel.gain.value = 0.2;
  body.connect(bodyLevel).connect(envelope);

  tine.type = "sine";
  tine.frequency.value = frequency;
  tineLevel.gain.value = 0.13;
  tine.connect(tineLevel).connect(envelope);
  modulator.type = "sine";
  modulator.frequency.value = frequency;
  modulation.gain.setValueAtTime(frequency * 2.3, now);
  modulation.gain.exponentialRampToValueAtTime(frequency * 0.8, now + 0.16);
  modulation.gain.exponentialRampToValueAtTime(
    frequency * 0.45,
    now + NOTE_TIMING.hold,
  );
  modulation.gain.exponentialRampToValueAtTime(
    frequency * 0.18,
    now + NOTE_TIMING.decayEnd,
  );
  modulator.connect(modulation).connect(tine.frequency);

  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(1, now + NOTE_TIMING.attack);
  envelope.gain.linearRampToValueAtTime(0.86, now + 0.14);
  envelope.gain.linearRampToValueAtTime(0.8, now + NOTE_TIMING.hold);
  envelope.gain.exponentialRampToValueAtTime(0.24, now + NOTE_TIMING.decayKnee);
  envelope.gain.exponentialRampToValueAtTime(
    0.0001,
    now + NOTE_TIMING.decayEnd,
  );
  envelope.gain.linearRampToValueAtTime(0, now + NOTE_TIMING.end);
  envelope.connect(motion).connect(output);

  motion.gain.value = 0.945;
  tremolo.type = "sine";
  tremolo.frequency.value = 4.6;
  tremoloDepth.gain.value = 0.055;
  tremolo.connect(tremoloDepth).connect(motion.gain);

  for (const oscillator of oscillators) {
    oscillator.start(now);
    oscillator.stop(now + NOTE_TIMING.end + 0.01);
    oscillator.onended = () => {
      oscillator.disconnect();
      if (--remaining === 0) {
        for (const node of nodes) node.disconnect();
        options.onEnded?.();
      }
    };
  }

  return {
    release() {
      if (released || remaining === 0) return;
      released = true;
      const at = context.currentTime;
      // Keep a short release between notes instead of abruptly cutting the body.
      output.gain.setValueAtTime(1, at);
      output.gain.linearRampToValueAtTime(0, at + NOTE_TIMING.retriggerRelease);
      for (const oscillator of oscillators)
        oscillator.stop(at + NOTE_TIMING.retriggerRelease + 0.01);
    },
  };
}
