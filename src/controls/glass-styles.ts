export const GLASS_STYLE_ID = 'pf-glass-styles'

export const GLASS_CSS = `
/* Chrome regions: translucent glass surfaces that blur what scrolls behind */
.pf-controls {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  color: var(--pf-ink, #172033);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  -webkit-font-smoothing: antialiased;
}
.pf-controls *, .pf-controls *::before, .pf-controls *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
/* Lucide icons are authored on a 24px canvas; render them uniformly at 18px.
   They use stroke="currentColor", so they inherit the control's color. */
.pf-controls svg {
  width: 18px;
  height: 18px;
  display: block;
  flex: none;
}
/* Chrome regions: translucent glass surfaces that blur what scrolls behind
   them, hairline borders, soft shadows. All in normal flow — never overlay. */
.pf-top,
.pf-bottom,
.pf-rail {
  background: var(--pf-glass, rgba(250, 251, 253, 0.72));
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
}
.pf-top,
.pf-bottom {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  padding: 6px 10px;
  overflow-x: auto;
  scrollbar-width: none;
  box-shadow: var(--pf-glass-shadow, 0 1px 2px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8));
  animation: pf-in 0.18s ease-out;
}
.pf-top {
  border-bottom: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
}
.pf-bottom {
  border-top: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
  padding: 4px 10px;
}
.pf-top::-webkit-scrollbar,
.pf-bottom::-webkit-scrollbar {
  display: none;
}
@keyframes pf-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.pf-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: row;
}
.pf-body__middle {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  position: relative;
}
.pf-rail {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
  min-width: 0;
}
.pf-rail--left {
  border-right: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
}
.pf-rail--right {
  border-left: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
}
.pf-rail .pf-group {
  align-items: center;
  width: 100%;
}
.pf-rail .pf-row {
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.pf-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 2px;
}
.pf-group__label {
  padding: 0 6px;
  padding-top: 2px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  line-height: 1;
  color: var(--pf-ink-faint, #76808e);
  user-select: none;
  white-space: nowrap;
}
.pf-rail .pf-group__label {
  text-align: center;
  width: 100%;
}
.pf-group__label:empty { display: none; }
.pf-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
/* A tiny labelled caption above a control (used by the bottom image tools:
   "MAGNIFICATION 4x 8x …" / "LENS SIZE 100px …"). */
.pf-pair {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.pf-pair__label {
  padding: 0 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  line-height: 1;
  color: var(--pf-ink-faint, #76808e);
  user-select: none;
  white-space: nowrap;
}
.pf-group--center { margin: 0 auto; }
.pf-spacer {
  flex: 1 1 auto;
  min-width: 6px;
}
.pf-divider {
  width: 1px;
  align-self: stretch;
  margin: 10px 3px;
  background: linear-gradient(180deg, transparent, var(--pf-glass-line, rgba(15, 23, 42, 0.12)), transparent);
}
.pf-rail .pf-divider {
  width: auto;
  height: 1px;
  align-self: stretch;
  margin: 2px 0;
  background: linear-gradient(90deg, transparent, var(--pf-glass-line-strong, rgba(15, 23, 42, 0.12)), transparent);
}
/* File context: icon + ellipsized name + format badge. */
.pf-fileinfo {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 4px;
  max-width: 260px;
}
.pf-fileinfo__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1 1 auto;
  font-weight: 600;
  color: var(--pf-ink, #172033);
}
.pf-fileinfo__badge {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--pf-accent-strong, #1d4ed8);
  background: var(--pf-accent-tint, rgba(37, 99, 235, 0.1));
  border: 1px solid var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
}
.pf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  flex: none;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease, transform 0.06s ease;
}
.pf-btn:hover {
  background: var(--pf-hover-strong, rgba(255, 255, 255, 0.8));
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
}
.pf-btn:active {
  transform: scale(0.93);
}
.pf-btn:focus-visible {
  outline: 2px solid var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
  outline-offset: 1px;
}
.pf-btn--on {
  background: var(--pf-accent-tint, rgba(37, 99, 235, 0.1));
  color: var(--pf-accent-strong, #1d4ed8);
  border-color: var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
}
.pf-btn--on:hover {
  background: var(--pf-accent-tint, rgba(37, 99, 235, 0.16));
}
.pf-btn--chip {
  width: auto;
  padding: 0 8px;
  min-width: 42px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--pf-ink-soft, #46505f);
}
.pf-txt {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: var(--pf-ink-soft, #46505f);
  white-space: nowrap;
}
.pf-input {
  height: 30px;
  min-width: 0;
  border-radius: 9px;
  border: 1px solid var(--pf-seg-border, rgba(15, 23, 42, 0.08));
  background: var(--pf-seg-bg, rgba(255, 255, 255, 0.5));
  padding: 0 6px;
  color: var(--pf-ink, #172033);
  font: inherit;
  font-size: 12px;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
}
.pf-input::-webkit-outer-spin-button,
.pf-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pf-input::placeholder {
  color: var(--pf-ink-faint, #76808e);
}
.pf-input:hover {
  border-color: var(--pf-glass-line, rgba(15, 23, 42, 0.2));
}
.pf-input:focus {
  border-color: var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
  background: var(--pf-hover-strong, rgba(255, 255, 255, 0.9));
  box-shadow: 0 0 0 3px var(--pf-accent-tint, rgba(37, 99, 235, 0.14));
}
.pf-input--page {
  width: 34px;
  padding: 0 2px;
}
.pf-input--rotate {
  width: 56px;
  padding: 0 4px;
}
.pf-seg {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 2px;
  border-radius: 10px;
  background: var(--pf-seg-bg, rgba(255, 255, 255, 0.5));
  border: 1px solid var(--pf-seg-border, rgba(15, 23, 42, 0.08));
}
.pf-seg--stack {
  flex-direction: column;
  align-items: stretch;
  width: 132px;
  max-width: 46vw;
}
.pf-seg--stack .pf-seg__btn {
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 10px;
}
.pf-seg__btn {
  height: 24px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--pf-ink-soft, #46505f);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
}
.pf-seg__btn:hover {
  background: var(--pf-hover-strong, rgba(255, 255, 255, 0.8));
}
.pf-seg__btn:active {
  transform: scale(0.95);
}
.pf-seg__btn:focus-visible {
  outline: 2px solid var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
  outline-offset: 1px;
}
.pf-seg__btn--on {
  background: var(--pf-seg-on, #ffffff);
  color: var(--pf-accent-strong, #1d4ed8);
  font-weight: 600;
  box-shadow: var(--pf-seg-on-shadow, 0 1px 3px rgba(15, 23, 42, 0.14));
}
.pf-seg__btn--on:hover {
  background: var(--pf-seg-on, #ffffff);
}
/* Narrow surfaces: the rails reflow beneath the stage as horizontal strips so
   every control stays reachable — nothing folds into a hidden overflow menu. */
@media (max-width: 760px) {
  .pf-body {
    flex-direction: column;
  }
  .pf-body__middle,
  .pf-stage {
    order: 0;
  }
  .pf-rail {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 12px;
  }
  .pf-rail--left {
    order: 1;
    border-right: none;
    border-top: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
  }
  .pf-rail--right {
    order: 2;
    border-left: none;
    border-top: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
  }
  .pf-rail .pf-row {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  .pf-rail .pf-divider {
    width: 1px;
    height: auto;
    align-self: stretch;
    margin: 0 2px;
  }
  .pf-seg--stack {
    width: auto;
  }
}
@media (pointer: coarse) {
  .pf-btn { width: 38px; height: 38px; }
  .pf-btn--chip { height: 38px; }
  .pf-input { height: 38px; }
  .pf-seg__btn { height: 30px; padding: 0 12px; }
  .pf-bottom .pf-btn { width: 34px; height: 34px; }
}
@media (max-width: 480px) {
  .pf-group__label { display: none; }
  .pf-fileinfo { max-width: 150px; }
}
@media (prefers-reduced-motion: reduce) {
  .pf-top, .pf-bottom { animation: none; }
  .pf-btn, .pf-seg__btn, .pf-input { transition: none; }
}
`

export function ensureGlassStyles(): void {
  if (document.getElementById(GLASS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = GLASS_STYLE_ID
  style.textContent = GLASS_CSS
  document.head.appendChild(style)
}