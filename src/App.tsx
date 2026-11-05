import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMidi, useMobileLayout, usePreferences, useTone } from "./hooks.ts";
import {
  createQuestion,
  DIFFICULTY_NAMES,
  MODE_NAMES,
  NOTE_NAMES,
} from "./music.ts";
import type { Preferences, QuizConfig } from "./music.ts";
import { practiceReducer, startPractice } from "./practice.ts";
import { Select, Toggle } from "./components/Controls.tsx";
import "./App.css";

const KEY_CODES = [
  "KeyA",
  "KeyW",
  "KeyS",
  "KeyE",
  "KeyD",
  "KeyF",
  "KeyT",
  "KeyG",
  "KeyY",
  "KeyH",
  "KeyU",
  "KeyJ",
];
const BLACK_POSITIONS: Record<number, number> = {
  1: 1,
  3: 2,
  6: 4,
  8: 5,
  10: 6,
};

function Icon({
  name,
  size = 18,
}: {
  name: "sound" | "midi" | "chevron" | "check" | "arrow" | "settings";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    sound: (
      <>
        <path d="m11 5-5 4H3v6h3l5 4z" />
        <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    midi: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v8h3V5m4 0v8h3V5M9 13v6m6-6v6" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: (
      <>
        <path d="M5 12h14m-5-5 5 5-5 5" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="17" r="2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function App() {
  const mobile = useMobileLayout();
  const [preferences, setPreferences] = usePreferences();
  const [session, dispatch] = useReducer(
    practiceReducer,
    preferences,
    (config) => startPractice(createQuestion(config)),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const configurationRef = useRef<HTMLElement>(null);
  const [midiOpen, setMidiOpen] = useState(false);
  const [settledErrorToken, setSettledErrorToken] = useState("");
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const { play, prepare, unavailable: audioUnavailable } = useTone();

  const submit = useCallback(
    (note: number) => {
      if (session.solved) return;
      if (preferences.sound) void play(note);
      dispatch({ type: "answer", note });
    },
    [session.solved, preferences.sound, play],
  );
  const midi = useMidi(!mobile, submit);
  const modeName = MODE_NAMES[preferences.mode];
  const scaleName = `${NOTE_NAMES[preferences.tonic]} ${modeName}`;
  const accuracy = session.total
    ? Math.round((session.correct / session.total) * 100)
    : null;
  const errorToken = `${session.question.id}:${session.errors}`;
  const wrongAnimation =
    !session.solved &&
    session.attempts > 0 &&
    session.errors > 0 &&
    errorToken !== settledErrorToken;

  const advance = useCallback(() => {
    if (midi.held) return;
    dispatch({
      type: "next",
      previousId: session.question.id,
      question: createQuestion(preferences, session.question),
    });
  }, [midi.held, session.question, preferences]);

  useEffect(() => {
    if (!session.solved || !preferences.autoAdvance || midi.held) return;
    const timer = window.setTimeout(advance, 550);
    return () => window.clearTimeout(timer);
  }, [session.solved, preferences.autoAdvance, midi.held, advance]);

  useEffect(() => {
    if (!session.errors) return;
    const timer = window.setTimeout(
      () => setSettledErrorToken(errorToken),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [session.errors, errorToken]);

  useEffect(() => {
    if (mobile) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey)
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input,select,textarea,[contenteditable="true"],[data-quiz-control]',
        )
      )
        return;
      const pitch = KEY_CODES.indexOf(event.code);
      if (pitch < 0) return;
      event.preventDefault();
      setPressedKeys((previous) => new Set(previous).add(event.code));
      submit(pitch);
    };
    const keyup = (event: KeyboardEvent) =>
      setPressedKeys((previous) => {
        if (!previous.has(event.code)) return previous;
        const next = new Set(previous);
        next.delete(event.code);
        return next;
      });
    const blur = () => setPressedKeys(new Set());
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
  }, [mobile, submit]);

  useEffect(() => {
    if (!mobile || !settingsOpen) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (
        configurationRef.current?.contains(event.target) ||
        event.target.closest(".select-popup")
      )
        return;
      setSettingsOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [mobile, settingsOpen]);

  function updateConfig(patch: Partial<QuizConfig>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    dispatch({
      type: "restart",
      question: createQuestion(next, session.question),
    });
  }

  function updatePreference(key: "autoAdvance" | "sound", value: boolean) {
    setPreferences((previous: Preferences) => ({ ...previous, [key]: value }));
  }

  function answerClass(pitch: number) {
    return [
      session.solved && session.lastAnswer === pitch ? "is-correct" : "",
      wrongAnimation && session.lastAnswer === pitch ? "is-wrong" : "",
      pressedKeys.has(KEY_CODES[pitch]) ? "is-pressed" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className={`app-shell ${mobile ? "is-mobile" : ""}`}>
      <header className="app-header">
        <a className="brand" href="./" aria-label="音题 Tone Quiz 首页">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            音题<span className="brand-english">TONE QUIZ</span>
          </span>
        </a>
        <span className="practice-tag">
          <span />
          单音练习
        </span>
        {!mobile && (
          <div className="midi-control">
            <button
              className={`button midi-trigger ${midi.connected ? "connected" : ""}`}
              aria-expanded={midiOpen}
              onClick={() => setMidiOpen(!midiOpen)}
            >
              <Icon name="midi" />
              <span>{midi.connected ? "MIDI 已连接" : "连接 MIDI"}</span>
              <Icon name="chevron" size={14} />
            </button>
            {midiOpen && (
              <section className="midi-panel" aria-label="MIDI 连接设置">
                <div className="panel-heading">
                  <strong>MIDI 键盘</strong>
                  <button
                    className="text-button"
                    onClick={() => setMidiOpen(false)}
                    aria-label="关闭 MIDI 设置"
                  >
                    关闭
                  </button>
                </div>
                {!midi.supported ? (
                  <p>
                    当前浏览器不支持 MIDI。请通过 HTTPS 或本机地址，在 Chrome /
                    Edge 中打开。
                  </p>
                ) : (
                  <>
                    {!midi.authorized || midi.error ? (
                      <>
                        <button
                          className="button primary"
                          disabled={midi.connecting}
                          onClick={() => {
                            void prepare();
                            void midi.connect();
                          }}
                        >
                          {midi.connecting
                            ? "正在连接…"
                            : midi.error
                              ? "重新连接"
                              : "连接设备"}
                        </button>
                      </>
                    ) : midi.inputs.length === 0 ? (
                      <p role="status">
                        未发现 MIDI 键盘，连接设备后将自动识别。
                      </p>
                    ) : (
                      <Select
                        label="输入设备"
                        value={midi.selectedId}
                        onChange={midi.setSelectedId}
                        options={midi.inputs.map((input) => ({
                          value: input.id,
                          label: input.name || "未命名 MIDI 设备",
                        }))}
                      />
                    )}
                    {midi.error && <p role="status">{midi.error}</p>}
                    {midi.connected && (
                      <p className="device-ready">
                        <span />
                        已连接
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </header>

      <main>
        <section
          ref={configurationRef}
          className={`configuration ${settingsOpen ? "is-open" : ""}`}
          aria-label="练习设置"
        >
          <button
            className="mobile-settings-trigger"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <span>
              <strong>{scaleName}</strong>
              <span className="summary-separator">/</span>
              {DIFFICULTY_NAMES[preferences.difficulty]}
            </span>
            <Icon name="settings" />
          </button>
          <div
            className="configuration-fields"
            inert={mobile && !settingsOpen}
            aria-hidden={mobile && !settingsOpen}
          >
            <Select
              label="主音"
              value={String(preferences.tonic)}
              grid
              onChange={(value) => updateConfig({ tonic: Number(value) })}
              options={NOTE_NAMES.map((name, pitch) => ({
                value: String(pitch),
                label: name,
              }))}
            />
            <Select
              label="调性"
              value={preferences.mode}
              onChange={(value) =>
                updateConfig({ mode: value as QuizConfig["mode"] })
              }
              options={[
                { value: "major", label: "自然大调" },
                { value: "minor", label: "自然小调" },
              ]}
            />
            <Select
              label="题目范围"
              value={preferences.difficulty}
              onChange={(value) =>
                updateConfig({ difficulty: value as QuizConfig["difficulty"] })
              }
              options={[
                { value: "diatonic", label: "基础 · 调内音" },
                { value: "chromatic", label: "进阶 · 加入调外音" },
              ]}
            />
          </div>
        </section>

        <section
          className={`practice ${midi.connected ? "midi-active" : ""}`}
          aria-label="单音练习"
        >
          <div className="practice-topline">
            <div className="statistics" aria-label="本轮统计">
              <span>
                正确率{" "}
                <strong>{accuracy === null ? "—" : `${accuracy}%`}</strong>
              </span>
              <span>
                已答 <strong>{session.total}</strong>
              </span>
              <span>
                连对 <strong>{session.streak}</strong>
              </span>
            </div>
          </div>

          <div className="question-zone">
            <div className="question-meta">
              <p className="question-key">{scaleName}</p>
              <button
                className="listen-button"
                disabled={audioUnavailable}
                onClick={() => {
                  void play(preferences.tonic);
                }}
              >
                <Icon name="sound" size={16} />
                {audioUnavailable ? "声音不可用" : "听主音"}
              </button>
            </div>
            <div
              key={`${session.question.id}-${session.errors}`}
              className={`degree ${wrongAnimation ? "wrong-animation" : ""} ${session.solved ? "solved" : ""}`}
              aria-label={`当前题目：${session.question.degree.label}`}
            >
              <span className="degree-accidental">
                {session.question.degree.label.match(/^[♭♯]/)?.[0]}
              </span>
              <span>{session.question.degree.label.replace(/^[♭♯]/, "")}</span>
            </div>
            <div
              className="feedback-slot"
              aria-live="polite"
              aria-atomic="true"
            >
              {session.solved && (
                <div className="success-feedback">
                  <Icon name="check" size={17} />
                  <span>
                    {NOTE_NAMES[preferences.tonic]} →{" "}
                    <strong>{NOTE_NAMES[session.question.answer]}</strong>
                    <span className="feedback-divider">·</span>
                    {session.question.degree.label}
                    <span className="feedback-interval">
                      ，{session.question.degree.interval}
                    </span>
                  </span>
                </div>
              )}
              {wrongAnimation && (
                <span className="sr-only">回答错误，请重试。</span>
              )}
            </div>
          </div>

          <div className="answer-area">
            <div className="practice-actions">
              <Toggle
                label="自动下一题"
                compactLabel="自动切题"
                checked={preferences.autoAdvance}
                onChange={(value) => updatePreference("autoAdvance", value)}
              />
              <button
                type="button"
                className={`next-button ${session.solved ? "available" : ""}`}
                aria-label={
                  midi.held && session.solved ? "松开琴键后继续" : "下一题"
                }
                title={
                  midi.held && session.solved ? "松开琴键后继续" : "下一题"
                }
                disabled={!session.solved || midi.held}
                onClick={advance}
              >
                <span>
                  {midi.held && session.solved ? "松开琴键后继续" : "下一题"}
                </span>
                <Icon name="arrow" size={19} />
              </button>
              <Toggle
                kind="checkbox"
                label="答题发声"
                compactLabel="声音"
                checked={preferences.sound}
                onChange={(value) => updatePreference("sound", value)}
              />
            </div>
            {mobile ? (
              <div className="note-grid" aria-label="选择音名">
                {NOTE_NAMES.map((name, pitch) => (
                  <button
                    key={name}
                    className={`note-pad ${answerClass(pitch)}`}
                    aria-label={`回答 ${name}`}
                    disabled={session.solved}
                    onClick={() => submit(pitch)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="piano" aria-label="钢琴答题键盘">
                <div className="white-keys">
                  {[0, 2, 4, 5, 7, 9, 11].map((pitch) => (
                    <button
                      key={pitch}
                      className={`piano-key white-key ${answerClass(pitch)}`}
                      disabled={session.solved}
                      aria-label={`回答 ${NOTE_NAMES[pitch]}，快捷键 ${KEY_CODES[pitch].slice(3)}`}
                      onClick={() => submit(pitch)}
                    >
                      <span>{NOTE_NAMES[pitch]}</span>
                      <kbd>{KEY_CODES[pitch].slice(3)}</kbd>
                    </button>
                  ))}
                </div>
                {Object.entries(BLACK_POSITIONS).map(
                  ([pitchString, position]) => {
                    const pitch = Number(pitchString);
                    return (
                      <button
                        key={pitch}
                        style={{ "--key-position": position } as CSSProperties}
                        className={`piano-key black-key ${answerClass(pitch)}`}
                        disabled={session.solved}
                        aria-label={`回答 ${NOTE_NAMES[pitch]}，快捷键 ${KEY_CODES[pitch].slice(3)}`}
                        onClick={() => submit(pitch)}
                      >
                        <span>{NOTE_NAMES[pitch]}</span>
                        <kbd>{KEY_CODES[pitch].slice(3)}</kbd>
                      </button>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
