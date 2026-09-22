export const ARCHIVE_STYLE_ID = 'pf-archive-styles'

export const ARCHIVE_CSS = `
.pf-archive {
  --ink: var(--pf-ink, #172033);
  --ink-soft: var(--pf-ink-soft, #46505f);
  --ink-faint: var(--pf-ink-faint, #76808e);
  --line: var(--pf-line, #dce1e8);
  --line-end: var(--pf-line-end, #eef1f5);
  --bar: var(--pf-surface-2, #f6f8fb);
  --surface: var(--pf-surface, #ffffff);
  --accent: var(--pf-accent, #2563eb);
  --accent-tint: var(--pf-accent-tint, rgba(37, 99, 235, 0.1));
  --error: var(--pf-error, #d1242f);
  --success: var(--pf-success, #16803c);
  --folder: var(--pf-folder, #a16207);
  --file: var(--pf-file, #59636e);
  box-sizing: border-box;
  color: var(--ink);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
}
.pf-archive *, .pf-archive *::before, .pf-archive *::after { box-sizing: border-box; }
.pf-archive .pf-icon svg { width: 100%; height: 100%; display: block; }
.pf-archive button.pf-ibtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  cursor: pointer;
  flex: 0 0 28px;
}
.pf-archive button.pf-ibtn:hover { background: var(--bar); color: var(--ink); }
.pf-archive button.pf-ibtn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
.pf-archive button.pf-ibtn:focus-visible,
.pf-archive input.pf-input:focus-visible,
.pf-archive .pf-arc-abl:focus-visible,
.pf-archive .pf-arc-row:focus-visible,
.pf-archive button.pf-arc-eye:focus-visible,
.pf-archive button.pf-arc-primary:focus-visible,
.pf-archive button.pf-arc-ghost:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

/* ---- Single-pane explorer layout. No second pane, no nested preview; every
   control is a normal-flow sibling so nothing can overlap anything. ---- */
.pf-arc {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
}
.pf-arc-tree { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf-arc-tree__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 8px;
  border-bottom: 1px solid var(--line-end);
}
.pf-arc-nav { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.pf-arc-crumbs { flex: 1 1 auto; min-width: 40px; display: flex; align-items: center; gap: 2px; overflow: hidden; }
.pf-arc-abl {
  border: none;
  background: transparent;
  padding: 2px 3px;
  border-radius: 4px;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  flex: 0 1 auto;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pf-arc-abl:hover { text-decoration: underline; }
.pf-arc-badge {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
  background: var(--surface);
}
.pf-arc-tree__list { flex: 1 1 auto; min-height: 0; position: relative; overflow: auto; }
.pf-arc-trunk { position: relative; width: 100%; }
.pf-arc-empty { padding: 28px 16px; color: var(--ink-soft); text-align: center; }
.pf-arc-tree__foot {
  flex: 0 0 auto;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--ink-faint);
  border-top: 1px solid var(--line-end);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.pf-arc-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  cursor: pointer;
  color: var(--ink);
  border-bottom: 1px solid var(--line-end);
  outline: none;
}
.pf-arc-row:hover { background: var(--bar); }
.pf-arc-row:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.pf-arc-row--cur { background: var(--accent-tint); box-shadow: inset 2px 0 0 var(--accent); }
.pf-arc-row--cur:hover { background: var(--accent-tint); }
.pf-arc-row__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-arc-row__size { flex: 0 0 auto; font-size: 11.5px; color: var(--ink-faint); padding-right: 2px; }

/* ---- Password unlock (Liquid Glass modal over the whole explorer). While it
   is visible the tree holds no rows, breadcrumbs, counts or sizes. ---- */
.pf-arc-lock {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(244, 246, 249, 0.9);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  backdrop-filter: blur(10px) saturate(140%);
  z-index: 5;
}
.pf-arc-lockcard {
  width: 100%;
  max-width: 360px;
  padding: 22px 20px 16px;
  border-radius: 16px;
  background: var(--pf-glass-strong, rgba(255, 255, 255, 0.92));
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--pf-glass-line-strong, rgba(15, 23, 42, 0.12));
  box-shadow: var(--pf-menu-shadow, 0 22px 46px rgba(15, 23, 42, 0.18)), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  animation: pf-arc-pop 0.16s ease-out;
}
@keyframes pf-arc-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.pf-arc-lockicon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: var(--accent-tint);
  color: var(--pf-accent-strong, #1d4ed8);
  margin-bottom: 12px;
}
.pf-arc-lockicon svg { width: 20px; height: 20px; }
.pf-arc-locktitle { font-size: 15px; font-weight: 650; color: var(--ink); margin: 0 0 4px; }
.pf-arc-lockhint { color: var(--ink-soft); font-size: 12.5px; line-height: 1.5; margin: 0; }
.pf-arc-lockfield { position: relative; margin-top: 12px; }
.pf-arc-lockfield input {
  width: 100%;
  height: 38px;
  padding: 0 40px 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}
.pf-arc-lockfield input::placeholder { color: var(--ink-faint); }
.pf-arc-lockfield input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--pf-accent-tint, rgba(37, 99, 235, 0.14));
}
.pf-arc-lockfield--error input {
  border-color: var(--error);
  box-shadow: 0 0 0 3px rgba(209, 36, 47, 0.12);
}
.pf-arc-lockfield input:disabled { opacity: 0.7; }
.pf-archive button.pf-arc-eye {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-faint);
  cursor: pointer;
}
.pf-archive button.pf-arc-eye:hover { color: var(--ink); background: var(--pf-hover, rgba(15, 23, 42, 0.05)); }
.pf-arc-lockmsg { min-height: 18px; margin-top: 6px; font-size: 12px; color: var(--error); line-height: 1.4; }
.pf-arc-lockactions { display: flex; gap: 8px; margin-top: 10px; }
.pf-archive button.pf-arc-primary,
.pf-archive button.pf-arc-ghost {
  flex: 1 1 auto;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.pf-archive button.pf-arc-primary {
  border: none;
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
  transition: background 0.14s ease, box-shadow 0.14s ease;
}
.pf-archive button.pf-arc-primary:hover { background: var(--pf-accent-strong, #1d4ed8); box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3); }
.pf-archive button.pf-arc-primary:disabled { opacity: 0.65; cursor: default; box-shadow: none; }
.pf-archive button.pf-arc-ghost {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-weight: 500;
  transition: background 0.14s ease;
}
.pf-archive button.pf-arc-ghost:hover { background: var(--bar); }
.pf-arc-spinner {
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #ffffff;
  animation: pf-arc-spin 0.7s linear infinite;
}
@keyframes pf-arc-spin { to { transform: rotate(360deg); } }

@media (max-width: 480px) {
  .pf-arc-lock { padding: 14px; }
  .pf-arc-lockcard { padding: 18px 16px 14px; }
  .pf-arc-lockactions { flex-direction: column; }
}
@media (pointer: coarse) {
  .pf-archive button.pf-ibtn { width: 38px; height: 38px; flex-basis: 38px; }
  .pf-arc-lockfield input,
  .pf-archive button.pf-arc-primary,
  .pf-archive button.pf-arc-ghost { height: 42px; }
}
@media (prefers-reduced-motion: reduce) {
  .pf-arc-lockcard { animation: none; }
  .pf-arc-spinner { animation-duration: 1.4s; }
}
`

export function ensureArchiveStyles(): void {
  if (document.getElementById(ARCHIVE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = ARCHIVE_STYLE_ID
  style.textContent = ARCHIVE_CSS
  document.head.appendChild(style)
}