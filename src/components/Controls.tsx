import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import "./Controls.css";

type Option = { value: string; label: string };
type SelectProps = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  grid?: boolean;
};

export function Select({
  label,
  value,
  options,
  onChange,
  grid = false,
}: SelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const search = useRef({ text: "", at: 0 });
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 320,
    above: false,
  });
  const selected = options.findIndex((option) => option.value === value);
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const expanded = phase === "open";

  const close = useCallback((restoreFocus = false) => {
    window.clearTimeout(closeTimer.current);
    setPhase("closing");
    closeTimer.current = window.setTimeout(() => setPhase("closed"), 160);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const measure = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor || !anchor.width || triggerRef.current?.closest("[inert]")) {
      close();
      return;
    }
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportWidth =
      viewport?.width ?? document.documentElement.clientWidth;
    const width = Math.min(
      Math.max(anchor.width, grid ? 240 : 220),
      viewportWidth - 24,
    );
    const desiredHeight = Math.min(
      320,
      (grid ? Math.ceil(options.length / 3) : options.length) * 48 + 16,
    );
    const below = viewportTop + viewportHeight - anchor.bottom - 20;
    const above = below < desiredHeight && anchor.top - viewportTop > below;
    const maxHeight = Math.max(
      48,
      Math.min(320, above ? anchor.top - viewportTop - 20 : below),
    );
    setPosition({
      left: Math.max(
        viewportLeft + 12,
        Math.min(anchor.left, viewportLeft + viewportWidth - width - 12),
      ),
      top: above ? anchor.top - 8 : anchor.bottom + 8,
      width,
      maxHeight,
      above,
    });
  }, [close, grid, options.length]);

  function open(index = Math.max(selected, 0)) {
    window.clearTimeout(closeTimer.current);
    measure();
    setActive(index);
    setPhase("open");
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // A focused control must never also trigger a piano shortcut.
    event.stopPropagation();
    if (
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const columns = grid ? 3 : 1;
    if (
      [
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      event.preventDefault();
      if (!expanded) {
        open(event.key === "End" ? options.length - 1 : Math.max(selected, 0));
        return;
      }
      const delta =
        event.key === "ArrowDown"
          ? columns
          : event.key === "ArrowUp"
            ? -columns
            : event.key === "ArrowRight"
              ? 1
              : -1;
      setActive((previous) =>
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (previous + delta + options.length) % options.length,
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (expanded) choose(activeIndex);
      else open();
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        close(true);
      }
    } else if (event.key === "Tab") {
      if (expanded) close();
    } else if (event.key.length === 1 && !event.nativeEvent.isComposing) {
      const now = Date.now();
      const text =
        now - search.current.at < 500
          ? search.current.text + event.key
          : event.key;
      search.current = { text, at: now };
      const match = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(text.toLowerCase()),
      );
      if (match >= 0) {
        event.preventDefault();
        if (!expanded) open(match);
        else setActive(match);
      }
    }
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        !triggerRef.current?.contains(event.target) &&
        !popupRef.current?.contains(event.target)
      )
        close();
    };
    const resize = new ResizeObserver(measure);
    if (triggerRef.current) resize.observe(triggerRef.current);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [expanded, close, measure]);
  useEffect(() => {
    if (expanded)
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, expanded, id]);

  return (
    <div className="select-field" data-quiz-control>
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${expanded ? "is-open" : ""}`}
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={phase !== "closed" ? `${id}-list` : undefined}
        aria-activedescendant={expanded ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => (expanded ? close() : open())}
        onKeyDown={onKeyDown}
      >
        <span id={`${id}-value`}>{options[selected]?.label ?? "选择设备"}</span>
        <svg
          className="select-chevron"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      {phase !== "closed" &&
        createPortal(
          <div
            ref={popupRef}
            className={`select-popup ${phase === "closing" ? "is-closing" : ""} ${grid ? "is-grid" : ""}`}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
              transform: position.above ? "translateY(-100%)" : undefined,
            }}
            data-side={position.above ? "above" : "below"}
            data-quiz-control
            aria-hidden={!expanded}
            inert={!expanded}
          >
            <div
              id={`${id}-list`}
              role="listbox"
              aria-label={label}
              className="select-options"
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  id={`${id}-option-${index}`}
                  aria-selected={option.value === value}
                  className={`select-option ${index === activeIndex ? "is-active" : ""}`}
                  onPointerMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  <span>{option.label}</span>
                  <svg
                    className="option-check"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Toggle({
  label,
  compactLabel,
  checked,
  onChange,
  kind = "switch",
}: {
  label: string;
  compactLabel?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  kind?: "switch" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={kind}
      aria-label={label}
      aria-checked={checked}
      className={`toggle-control ${kind === "switch" ? "switch-control" : "checkbox-control"} ${checked ? "is-on" : ""}`}
      data-quiz-control
      onClick={() => onChange(!checked)}
    >
      {kind === "switch" ? (
        <span className="toggle-track" aria-hidden="true">
          <span />
        </span>
      ) : (
        <span className="checkbox-box" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
      )}
      <span className={compactLabel ? "toggle-full-label" : undefined}>
        {label}
      </span>
      {compactLabel && (
        <span className="toggle-compact-label">{compactLabel}</span>
      )}
    </button>
  );
}
