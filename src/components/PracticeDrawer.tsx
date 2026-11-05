export function PracticeDrawer({ open, active, onSelect, onClose }: {
  open: boolean;
  active: "note" | "chord";
  onSelect: (mode: "note" | "chord") => void;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      drawerRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return (
    <>
      <button className={`drawer-backdrop ${open ? "is-open" : ""}`} onClick={onClose}
        aria-label="收起练习导航" tabIndex={-1} aria-hidden={!open} />
      <aside ref={drawerRef} id="practice-drawer" className={`practice-drawer ${open ? "is-open" : ""}`}
        role="dialog" aria-modal={open} aria-label="练习导航" inert={!open} onKeyDown={event => {
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const buttons = drawerRef.current?.querySelectorAll<HTMLButtonElement>('button');
            if (!buttons?.length) return;
            const target = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
            if (document.activeElement === target) {
              event.preventDefault();
              (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
            }
          }
        }}>
        <div className="drawer-heading"><span>练习</span><button className="drawer-close" onClick={onClose} aria-label="关闭练习导航">×</button></div>
        <nav aria-label="练习类型">
          {([['note', '单音练习', '01'], ['chord', '和弦练习', '02']] as const).map(([mode, name, number]) => (
            <button key={mode} className={`drawer-entry ${active === mode ? "is-active" : ""}`}
              aria-current={active === mode ? "page" : undefined} onClick={() => onSelect(mode)}>
              <span>{number}</span><strong>{name}</strong><span aria-hidden="true">↗</span>
            </button>
          ))}
        </nav>
        <span className="drawer-footnote">TONE QUIZ</span>
      </aside>
    </>
  );
}
import { useEffect, useRef } from "react";

