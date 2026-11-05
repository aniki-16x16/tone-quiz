import { useCallback, useEffect, useReducer, useState } from "react";
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
        event.target.closest('input,select,textarea,[contenteditable="true"]')
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
                        <p>连接键盘，授权后即可直接弹奏作答。</p>
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
                      <label className="select-field">
                        输入设备
                        <select
                          value={midi.selectedId}
                          onChange={(event) =>
                            midi.setSelectedId(event.target.value)
                          }
                        >
                          {midi.inputs.map((input) => (
                            <option key={input.id} value={input.id}>
                              {input.name || "未命名 MIDI 设备"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {midi.error && <p role="status">{midi.error}</p>}
                    {midi.connected && (
                      <p className="device-ready">
                        <span />
                        已就绪 · 任意八度均可作答
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
        <div className="page-heading">
          <div>
            <p className="eyebrow">NOTE BY NOTE</p>
            <h1>
              让级数成为直觉<span>。</span>
            </h1>
          </div>
          <p className="heading-description">看级数，回答对应的音。</p>
        </div>

        <section
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
          <div className="configuration-fields">
            <label className="select-field">
              主音
              <select
                value={preferences.tonic}
                onChange={(event) =>
                  updateConfig({ tonic: Number(event.target.value) })
                }
              >
                {NOTE_NAMES.map((name, pitch) => (
                  <option key={name} value={pitch}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              调性
              <select
                value={preferences.mode}
                onChange={(event) =>
                  updateConfig({
                    mode: event.target.value as QuizConfig["mode"],
                  })
                }
              >
                <option value="major">自然大调</option>
                <option value="minor">自然小调</option>
              </select>
            </label>
            <label className="select-field">
              题目范围
              <select
                value={preferences.difficulty}
                onChange={(event) =>
                  updateConfig({
                    difficulty: event.target.value as QuizConfig["difficulty"],
                  })
                }
              >
                <option value="diatonic">基础 · 调内音</option>
                <option value="chromatic">进阶 · 加入调外音</option>
              </select>
            </label>
            <div className="configuration-note">
              <span className="tiny-note">♪</span>
              <span>
                专注音高
                <br />
                无需区分八度
              </span>
            </div>
          </div>
        </section>

        <section
          className={`practice ${midi.connected ? "midi-active" : ""}`}
          aria-label="单音练习"
        >
          <div className="practice-topline">
            <span className="live-label">
              <span />
              正在练习
            </span>
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
            <p className="question-key">{scaleName}</p>
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
            <p className="question-instruction">
              {midi.connected ? "在 MIDI 键盘上弹奏对应的音" : "选择对应的音"}
            </p>
            <button
              className="listen-button"
              onClick={() => {
                void play(preferences.tonic);
              }}
            >
              <Icon name="sound" size={16} />
              听主音
            </button>
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
            <div className="answer-heading">
              <span>{midi.connected ? "键盘输入" : "你的答案"}</span>
              <span className="input-method">
                {mobile
                  ? "轻触作答"
                  : midi.connected
                    ? midi.inputs.find((input) => input.id === midi.selectedId)
                        ?.name || "MIDI 键盘"
                    : "鼠标点击 / 电脑键盘"}
              </span>
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
            <div className="practice-actions">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={preferences.autoAdvance}
                  onChange={(event) =>
                    updatePreference("autoAdvance", event.target.checked)
                  }
                />
                <span className="switch-track" aria-hidden="true" />
                <span>自动下一题</span>
              </label>
              <button
                className={`next-button ${session.solved ? "available" : ""}`}
                disabled={!session.solved || midi.held}
                onClick={advance}
              >
                {midi.held && session.solved ? "松开琴键后继续" : "下一题"}
                <Icon name="arrow" size={16} />
              </button>
              <label className="sound-setting">
                <input
                  type="checkbox"
                  checked={preferences.sound}
                  onChange={(event) =>
                    updatePreference("sound", event.target.checked)
                  }
                />
                <Icon name="sound" size={16} />
                <span>答题发声</span>
              </label>
            </div>
          </div>
        </section>
        <footer className="page-footer">
          <span>每一次作答，都离直觉更近一点。</span>
          <span>
            {audioUnavailable
              ? "当前浏览器暂时无法播放声音"
              : "首次作答计入正确率"}
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;
