const THEME_STYLE_ID = 'pf-theme-styles'

/**
 * The shared design-token surface for the whole library (the Liquid Glass
 * light system). Tokens are injected once per document under a single
 * `#pf-theme-styles` style element and are scoped to `.pf-root` — the element
 * `preview()` builds for every preview — so they cascade to the chrome and to
 * every renderer surface below it without leaking onto the host page.
 *
 * There is a single, deliberate visual system: translucent glass surfaces over
 * a soft neutral canvas, hairline borders, layered depth and accent-tinted
 * interaction states. No dark variant is shipped.
 */
export const THEME_CSS = `
.pf-root {
  color-scheme: light;
  --pf-ink: #172033;
  --pf-ink-soft: #46505f;
  --pf-ink-faint: #76808e;
  --pf-line: #dce1e8;
  --pf-line-soft: #eef1f5;
  --pf-bar: #f4f6f9;
  --pf-surface: #ffffff;
  --pf-surface-2: #f6f8fb;
  --pf-accent: #2563eb;
  --pf-accent-strong: #1d4ed8;
  --pf-accent-ring: rgba(37, 99, 235, 0.45);
  --pf-accent-tint: rgba(37, 99, 235, 0.1);
  --pf-error: #d1242f;
  --pf-success: #16803c;
  --pf-folder: #a16207;
  --pf-file: #59636e;
  --pf-code-bg: rgba(88, 101, 122, 0.14);

  /* Liquid Glass chrome surfaces. */
  --pf-glass: rgba(250, 251, 253, 0.72);
  --pf-glass-strong: rgba(255, 255, 255, 0.86);
  --pf-glass-rail: rgba(255, 255, 255, 0.45);
  --pf-glass-line: rgba(15, 23, 42, 0.08);
  --pf-glass-line-strong: rgba(15, 23, 42, 0.14);
  --pf-glass-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  --pf-panel-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  --pf-seg-bg: rgba(255, 255, 255, 0.5);
  --pf-seg-border: rgba(15, 23, 42, 0.08);
  --pf-seg-on: #ffffff;
  --pf-seg-on-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
  --pf-hover: rgba(15, 23, 42, 0.05);
  --pf-hover-strong: rgba(255, 255, 255, 0.8);
  --pf-menu-shadow: 0 22px 46px rgba(15, 23, 42, 0.18);

  --pf-doc-bg: #e3e7ec;
  --pf-doc-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
  --pf-empty: #6b7482;
  --pf-lock-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);

  --pf-token-comment: #6e7781;
  --pf-token-keyword: #cf222e;
  --pf-token-string: #0a3069;
  --pf-token-number: #0550ae;
  --pf-token-type: #0550ae;
  --pf-token-tag: #0550ae;
  --pf-token-function: #8250df;
  --pf-token-variable: #953800;
  --pf-token-boolean: #cf222e;
  --pf-token-constant: #e36209;
  --pf-token-regexp: #0a3069;
  --pf-token-entity: #8250df;
}

/* Shared state surfaces (loading / error cards) used by preview.ts. */
.pf-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  box-sizing: border-box;
  padding: 8px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  text-align: center;
  color: var(--pf-ink-soft);
}
.pf-state--action { color: var(--pf-error); }
.pf-state__actions { display: flex; gap: 6px; margin-top: 4px; }
.pf-state__btn {
  padding: 6px 14px;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pf-state__btn--primary {
  border: 1px solid var(--pf-error);
  background: var(--pf-surface);
  color: var(--pf-error);
}
.pf-state__btn--secondary {
  border: 1px solid var(--pf-line);
  background: var(--pf-surface);
  color: var(--pf-ink-soft);
}
`

export function ensureThemeStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(THEME_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = THEME_STYLE_ID
  style.textContent = THEME_CSS
  document.head.appendChild(style)
}