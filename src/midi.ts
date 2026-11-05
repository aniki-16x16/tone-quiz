export type NoteMessage = { kind: "on" | "off"; note: number; channel: number };

export function parseMidiNote(data: ArrayLike<number>): NoteMessage | null {
  if (data.length < 3) return null;
  const [status, note, velocity] = [data[0], data[1], data[2]];
  if (note < 0 || note > 127 || velocity < 0 || velocity > 127) return null;
  const command = status & 0xf0;
  if (command !== 0x80 && command !== 0x90) return null;
  return {
    kind: command === 0x90 && velocity > 0 ? "on" : "off",
    note,
    channel: status & 0x0f,
  };
}

export class MidiNoteGate {
  private held = new Set<string>();

  receive(message: NoteMessage): { submit: boolean; held: boolean } {
    const key = `${message.channel}:${message.note}`;
    const submit = message.kind === "on" && this.held.size === 0;
    if (message.kind === "on") this.held.add(key);
    else this.held.delete(key);
    return { submit, held: this.held.size > 0 };
  }
}
