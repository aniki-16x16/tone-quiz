import type { CSSProperties } from "react";
import { NOTE_NAMES, pitchClass } from "../music.ts";

const notes = Array.from({ length: 37 }, (_, index) => 36 + index);
const whiteNotes = notes.filter(note => [0, 2, 4, 5, 7, 9, 11].includes(pitchClass(note)));
const blackNotes = notes.filter(note => !whiteNotes.includes(note));

export function ChordKeyboard({
  held, connected, solved, wrongPitch,
}: {
  held: readonly number[];
  connected: boolean;
  solved: boolean;
  wrongPitch: number | null;
}) {
  function keyClass(note: number) {
    const pressed = held.includes(note);
    return [pressed ? "is-held" : "", pressed && solved ? "is-correct" : "",
      pressed && wrongPitch === pitchClass(note) ? "is-wrong" : ""].filter(Boolean).join(" ");
  }
  function label(note: number) {
    return `${NOTE_NAMES[pitchClass(note)]}${Math.floor(note / 12) - 1}`;
  }
  return (
    <div className={`chord-keyboard ${connected ? "" : "is-disconnected"}`}>
      <div className="keyboard-range" aria-hidden="true"><span>C2</span><span>C3</span><span>C4</span><span>C5</span></div>
      <div className="piano chord-piano" role="img" aria-label="MIDI 键盘，C2 至 C5，仅显示持键，不支持点击作答">
        <div className="white-keys">
          {whiteNotes.map(note => (
            <div key={note} className={`piano-key white-key ${keyClass(note)}`} aria-label={`${label(note)}${held.includes(note) ? "，已按下" : ""}`} />
          ))}
        </div>
        {blackNotes.map(note => (
          <div key={note} className={`piano-key black-key ${keyClass(note)}`}
            style={{ "--key-position": whiteNotes.filter(white => white < note).length } as CSSProperties}
            aria-label={`${label(note)}${held.includes(note) ? "，已按下" : ""}`} />
        ))}
      </div>
    </div>
  );
}
