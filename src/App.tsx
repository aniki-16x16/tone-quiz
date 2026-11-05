import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useChordPreferences, useMidi, useMobileLayout, usePreferences, useTone } from "./hooks.ts";
import {
  createQuestion,
  DIFFICULTY_NAMES,
  getAnswerNoteNames,
  MODE_NAMES,
  NOTE_NAMES,
  pitchClass,
} from "./music.ts";
import { NOTE_TIMING } from "./timing.ts";
import type { Preferences, QuizConfig } from "./music.ts";
import { practiceReducer, startPractice } from "./practice.ts";
import { Select, Toggle } from "./components/Controls.tsx";
import { ChordKeyboard } from "./components/ChordKeyboard.tsx";
import { PracticeDrawer } from "./components/PracticeDrawer.tsx";
import { CHORD_LEVELS, createChordQuestion } from "./chords.ts";
import type { ChordConfig } from "./chords.ts";
import type { MidiFrame } from "./midi.ts";
import "./App.css";

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
  name: "sound" | "midi" | "chevron" | "check" | "arrow" | "settings" | "menu";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
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
  const [desktopMode, setDesktopMode] = useState<"note" | "chord">("note");
  const chordMode = !mobile && desktopMode === "chord";
  const practiceMode = chordMode ? "chord" : "note";
  const practiceName = chordMode ? "和弦练习" : "单音练习";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const [preferences, setPreferences] = usePreferences();
  const [chordPreferences, setChordPreferences] = useChordPreferences();
  const config = chordMode ? chordPreferences : preferences;
  const [noteSession, noteDispatch] = useReducer(
    practiceReducer,
    preferences,
    (config) => {
      const question = createQuestion(config);
      return startPractice(question, createQuestion(config, question));
    },
  );
  const [chordSession, chordDispatch] = useReducer(
    practiceReducer, chordPreferences, (settings) => {
      const question = createChordQuestion(settings);
      return startPractice(question, createChordQuestion(settings, question));
    },
  );
  const session = chordMode ? chordSession : noteSession;
  const dispatch = chordMode ? chordDispatch : noteDispatch;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const configurationRef = useRef<HTMLElement>(null);
  const [midiOpen, setMidiOpen] = useState(false);
  const [settledErrorToken, setSettledErrorToken] = useState("");
  const [settledSuccessToken, setSettledSuccessToken] = useState("");
  const feedbackSequence = useRef(0);
  const [noteFeedback, setNoteFeedback] = useState<{
    pitch: number;
    id: number;
    questionId: number;
  } | null>(null);
  const { play, syncMidi, prepare, unavailable: audioUnavailable } = useTone();
  const inputQuestionRef = useRef("");
  const questionToken = `${practiceMode}:${session.question.id}`;

  const submit = useCallback(
    (note: number) => {
      if (chordMode || session.solved) return;
      setNoteFeedback({
        pitch: pitchClass(note),
        id: ++feedbackSequence.current,
        questionId: session.question.id,
      });
      if (preferences.sound) void play(note);
      dispatch({ type: "answer", note });
    },
    [chordMode, session.solved, session.question.id, preferences.sound, play, dispatch],
  );
  const receiveChord = useCallback((frame: MidiFrame) => {
    if (frame.first) inputQuestionRef.current = questionToken;
    const currentGesture = inputQuestionRef.current === questionToken;
    if (!chordMode || !currentGesture || session.solved) {
      syncMidi([]);
      return;
    }
    syncMidi(preferences.sound ? frame.notes : [], preferences.sound ? frame.noteOn : undefined);
    dispatch({ type: "chord", notes: frame.notes, noteOn: frame.noteOn, previousId: session.question.id });
  }, [chordMode, questionToken, session.solved, session.question.id, preferences.sound, syncMidi, dispatch]);
  const midi = useMidi(!mobile, submit, receiveChord);
  useEffect(() => {
    if (!chordMode || !midi.connected || !preferences.sound) syncMidi([]);
  }, [chordMode, midi.connected, preferences.sound, syncMidi]);
  const modeName = MODE_NAMES[config.mode];
  const answerNoteNames = getAnswerNoteNames(config);
  const scaleName = `${NOTE_NAMES[config.tonic]} ${modeName}`;
  const accuracy = session.total
    ? Math.round((session.correct / session.total) * 100)
    : null;
  const errorToken = `${questionToken}:${session.errors}`;
  const wrongAnimation =
    !session.solved &&
    session.attempts > 0 &&
    session.errors > 0 &&
    errorToken !== settledErrorToken;
  const successAnimation =
    session.solved && settledSuccessToken !== questionToken;

  const advance = useCallback(() => {
    if (midi.held) return;
    dispatch({
      type: "next",
      previousId: session.question.id,
      nextQuestion: chordMode ? createChordQuestion(chordPreferences, session.nextQuestion)
        : createQuestion(preferences, session.nextQuestion),
    });
  }, [midi.held, session.question.id, session.nextQuestion, preferences, chordPreferences, chordMode, dispatch]);

  useEffect(() => {
    if (!session.solved) return;
    const timer = window.setTimeout(
      () => setSettledSuccessToken(questionToken),
      NOTE_TIMING.answerMs,
    );
    return () => window.clearTimeout(timer);
  }, [session.solved, questionToken]);

  useEffect(() => {
    if (
      session.solved &&
      !successAnimation &&
      preferences.autoAdvance &&
      !midi.held
    )
      advance();
  }, [session.solved, successAnimation, preferences.autoAdvance, midi.held, advance]);

  useEffect(() => {
    if (!session.errors) return;
    const timer = window.setTimeout(
      () => setSettledErrorToken(errorToken),
      NOTE_TIMING.answerMs,
    );
    return () => window.clearTimeout(timer);
  }, [session.errors, errorToken]);

  useEffect(() => {
    if (!noteFeedback) return;
    const timer = window.setTimeout(
      () => setNoteFeedback(null),
      NOTE_TIMING.feedbackMs,
    );
    return () => window.clearTimeout(timer);
  }, [noteFeedback]);

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
    if (chordMode) {
      updateChordConfig(patch as Partial<ChordConfig>);
      return;
    }
    const next = { ...preferences, ...patch };
    setPreferences(next);
    const question = createQuestion(next, session.question);
    dispatch({
      type: "restart",
      question,
      nextQuestion: createQuestion(next, question),
    });
  }

  function updateChordConfig(patch: Partial<ChordConfig>) {
    const next = { ...chordPreferences, ...patch };
    setChordPreferences(next);
    const question = createChordQuestion(next, chordSession.question);
    chordDispatch({ type: "restart", question, nextQuestion: createChordQuestion(next, question) });
  }

  function closeDrawer() {
    setDrawerOpen(false);
    drawerTriggerRef.current?.focus({ preventScroll: true });
  }

  function updatePreference(key: "autoAdvance" | "sound", value: boolean) {
    setPreferences((previous: Preferences) => ({ ...previous, [key]: value }));
  }

  function answerClass(pitch: number) {
    return [
      session.solved && session.lastAnswer === pitch ? "is-correct" : "",
      wrongAnimation && session.lastAnswer === pitch ? "is-wrong" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function renderNoteFeedback(pitch: number) {
    if (
      !noteFeedback ||
      noteFeedback.pitch !== pitch ||
      noteFeedback.questionId !== session.question.id
    )
      return null;
    return (
      <span key={noteFeedback.id} className="key-feedback" aria-hidden="true" />
    );
  }

  return (
    <div
      className={`app-shell ${mobile ? "is-mobile" : ""} ${chordMode ? "chord-mode" : ""}`}
      style={
        {
          "--note-feedback-duration": `${NOTE_TIMING.feedbackMs}ms`,
          "--answer-feedback-duration": `${NOTE_TIMING.answerMs}ms`,
          "--question-transition-duration": `${NOTE_TIMING.transitionMs}ms`,
        } as CSSProperties
      }
    >
      <header className="app-header">
        {!mobile && (
          <button ref={drawerTriggerRef} className="drawer-trigger" aria-label="选择练习类型"
            aria-expanded={drawerOpen} aria-controls="practice-drawer" onClick={() => setDrawerOpen(!drawerOpen)}>
            <Icon name="menu" size={20} />
          </button>
        )}
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
          {practiceName}
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

      {!mobile && <PracticeDrawer open={drawerOpen} active={practiceMode}
        onClose={closeDrawer} onSelect={mode => { setDesktopMode(mode); closeDrawer(); }} />}

      <main inert={!mobile && drawerOpen}>
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
              value={String(config.tonic)}
              grid
              onChange={(value) => updateConfig({ tonic: Number(value) })}
              options={NOTE_NAMES.map((name, pitch) => ({
                value: String(pitch),
                label: name,
              }))}
            />
            <Select
              label="调性"
              value={config.mode}
              onChange={(value) =>
                updateConfig({ mode: value as QuizConfig["mode"] })
              }
              options={[
                { value: "major", label: "自然大调" },
                { value: "minor", label: "自然小调" },
              ]}
            />
            {chordMode ? <Select label="题目范围" value={chordPreferences.level}
              onChange={value => updateChordConfig({ level: value as ChordConfig["level"] })}
              options={Object.entries(CHORD_LEVELS).map(([value, label]) => ({ value, label }))} /> : <Select
              label="题目范围"
              value={preferences.difficulty}
              onChange={(value) =>
                updateConfig({ difficulty: value as QuizConfig["difficulty"] })
              }
              options={[
                { value: "diatonic", label: "基础 · 调内音" },
                { value: "chromatic", label: "进阶 · 加入调外音" },
              ]}
            />}
          </div>
          {chordMode && chordPreferences.level !== "diatonic" && (
            <div className="chord-options">
              <Toggle kind="checkbox" label="调外根音" checked={chordPreferences.includeChromaticRoots}
                onChange={includeChromaticRoots => updateChordConfig({ includeChromaticRoots })} />
              <Toggle kind="checkbox" label="挂留／add／六和弦" checked={chordPreferences.includeColors}
                onChange={includeColors => updateChordConfig({ includeColors })} />
              <Toggle kind="checkbox" label="转位／斜线和弦" checked={chordPreferences.includeSlash}
                onChange={includeSlash => updateChordConfig({ includeSlash })} />
            </div>
          )}
        </section>

        <section
          className={`practice ${midi.connected ? "midi-active" : ""}`}
          aria-label={practiceName}
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
                  void play(config.tonic);
                }}
              >
                <Icon name="sound" size={16} />
                {audioUnavailable ? "声音不可用" : "听主音"}
              </button>
            </div>
            <div className="question-track">
              {[session.question, session.nextQuestion].map((question, index) => (
                <div
                  key={question.id}
                  className={`question-card ${index === 0 ? "question-current" : "question-preview"}`}
                  aria-label={`${index === 0 ? "当前题目" : "下一题预览"}：${question.degree.label}`}
                >
                  <div
                    key={index === 0 ? session.errors : "preview"}
                    className={`degree ${index === 0 && wrongAnimation ? "wrong-animation" : ""} ${index === 0 && session.solved ? "solved" : ""} ${index === 0 && successAnimation ? "correct-animation" : ""}`}
                  >
                    {!chordMode && <span className="degree-accidental">
                      {question.degree.label.match(/^[♭♯]/)?.[0]}
                    </span>}
                    {chordMode ? <span className="chord-symbol">
                      {question.chord?.rootDegree}
                      <span className="chord-quality">{question.chord?.quality}</span>
                      {question.chord && question.chord.bass !== question.chord.root &&
                        <span className="chord-bass">/{question.chord.bassDegree}</span>}
                    </span> : <span>{question.degree.label.replace(/^[♭♯]/, "")}</span>}
                  </div>
                </div>
              ))}
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
                    {session.question.chord ? session.question.chord.toneNames.join(" · ") : <>
                    {answerNoteNames[config.tonic]} →{" "}
                    <strong>{answerNoteNames[session.question.answer]}</strong>
                    <span className="feedback-divider">·</span>
                    {session.question.degree.label}
                    <span className="feedback-interval">
                      ，{session.question.degree.interval}
                    </span></>}
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
            {chordMode ? <>
              <div className="chord-connection" role="status">
                {!midi.connected ? <button className="connect-chord-button" onClick={() => setMidiOpen(true)}>
                  <Icon name="midi" size={17} />连接 MIDI 键盘后作答<Icon name="arrow" size={16} />
                </button> : <span className="midi-ready"><i />MIDI 已连接</span>}
              </div>
              <ChordKeyboard connected={midi.connected} held={midi.notes} solved={session.solved}
                wrongPitch={wrongAnimation ? session.lastAnswer : null} />
            </> : mobile ? (
              <div className="note-grid" aria-label="选择音名">
                {answerNoteNames.map((name, pitch) => (
                  <button
                    key={pitch}
                    className={`note-pad ${answerClass(pitch)}`}
                    aria-label={`回答 ${name}`}
                    disabled={session.solved}
                    onClick={() => submit(pitch)}
                  >
                    {name}
                    {renderNoteFeedback(pitch)}
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
                      aria-label={`回答 ${answerNoteNames[pitch]}`}
                      onClick={() => submit(pitch)}
                    >
                      {renderNoteFeedback(pitch)}
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
                        aria-label={`回答 ${answerNoteNames[pitch]}`}
                        onClick={() => submit(pitch)}
                      >
                        {renderNoteFeedback(pitch)}
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
