import { useCallback, useEffect, useRef, useState } from "react";
import { MidiNoteGate, parseMidiNote } from "./midi.ts";
import { createMelodyVoice } from "./audio.ts";
import type { ToneVoice } from "./audio.ts";
import { DEFAULT_PREFERENCES, parsePreferences } from "./music.ts";
import type { Preferences } from "./music.ts";

const STORAGE_KEY = "tone-quiz.preferences.v1";
const MOBILE_QUERY = "(max-width: 760px), (hover: none) and (pointer: coarse)";

export function useMobileLayout() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      return parsePreferences(
        JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"),
      );
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      /* Practice also works when browser storage is unavailable. */
    }
  }, [preferences]);
  return [preferences, setPreferences] as const;
}

export function useTone() {
  const contextRef = useRef<AudioContext | null>(null);
  const voiceRef = useRef<ToneVoice | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const prepare = useCallback(async () => {
    try {
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (context.state === "suspended") await context.resume();
      return context;
    } catch {
      setUnavailable(true);
      return null;
    }
  }, []);
  const play = useCallback(
    async (pitch: number) => {
      const context = await prepare();
      if (!context || context.state !== "running") return;
      voiceRef.current?.release();
      voiceRef.current = createMelodyVoice(context, pitch);
    },
    [prepare],
  );
  useEffect(
    () => () => {
      voiceRef.current?.release();
      voiceRef.current = null;
      void contextRef.current?.close();
      contextRef.current = null;
    },
    [],
  );
  return { play, prepare, unavailable };
}

export function useMidi(enabled: boolean, onNote: (note: number) => void) {
  const [access, setAccess] = useState<MIDIAccess | null>(null);
  const [inputs, setInputs] = useState<MIDIInput[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [held, setHeld] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const noteRef = useRef(onNote);
  const requestRef = useRef(0);
  const supported =
    typeof navigator.requestMIDIAccess === "function" && window.isSecureContext;
  const selectedInput = inputs.find((input) => input.id === selectedId);

  useEffect(() => {
    noteRef.current = onNote;
  }, [onNote]);
  useEffect(
    () => () => {
      requestRef.current++;
      setConnecting(false);
    },
    [enabled],
  );

  const connect = useCallback(async () => {
    if (!enabled || !supported) return;
    const request = ++requestRef.current;
    setConnecting(true);
    setError("");
    try {
      const result = await navigator.requestMIDIAccess({ sysex: false });
      if (requestRef.current === request) {
        setAccess(result);
        setConnectionAttempt((previous) => previous + 1);
      }
    } catch (reason) {
      if (requestRef.current === request) {
        setError(
          reason instanceof DOMException &&
            (reason.name === "NotAllowedError" ||
              reason.name === "SecurityError")
            ? "MIDI 访问未获允许，可在浏览器站点设置中授权后重试。"
            : "暂时无法连接，请检查设备后重试。",
        );
      }
    } finally {
      if (requestRef.current === request) setConnecting(false);
    }
  }, [enabled, supported]);

  useEffect(() => {
    if (!access || !enabled) return;
    const sync = () => {
      const connected = Array.from(access.inputs.values()).filter(
        (input) => input.state === "connected",
      );
      setInputs(connected);
      setSelectedId((previous) =>
        connected.some((input) => input.id === previous)
          ? previous
          : (connected[0]?.id ?? ""),
      );
    };
    sync();
    access.addEventListener("statechange", sync);
    return () => access.removeEventListener("statechange", sync);
  }, [access, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const input = selectedInput;
    if (!input || input.state !== "connected") return;
    const gate = new MidiNoteGate();
    const receive = (event: MIDIMessageEvent) => {
      if (!event.data) return;
      const message = parseMidiNote(event.data);
      if (!message) return;
      const result = gate.receive(message);
      setHeld(result.held);
      if (result.submit) noteRef.current(message.note);
    };
    input.addEventListener("midimessage", receive);
    void input.open().catch(() => setError("设备无法打开，请重新连接后重试。"));
    return () => {
      setHeld(false);
      input.removeEventListener("midimessage", receive);
      void input.close().catch(() => {});
    };
  }, [enabled, selectedInput, connectionAttempt]);

  return {
    supported,
    connect,
    connecting,
    error,
    inputs,
    selectedId,
    setSelectedId: (id: string) => {
      setError("");
      setSelectedId(id);
    },
    held: enabled && held,
    authorized: access !== null,
    connected:
      enabled && !error && inputs.some((input) => input.id === selectedId),
  };
}
