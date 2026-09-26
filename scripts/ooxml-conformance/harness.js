/**
 * Shared reporting for the OOXML conformance suites.
 *
 * The suites run in a browser against the built package, so results are
 * collected as lines and handed back to the page. `reporter()` returns a `say`
 * that prints the two small things every suite needs: a pass/fail check and a
 * section heading.
 */
export function reporter(lines) {
  const state = { checks: 0, failures: 0 }

  const say = (line = '') => {
    lines.push(line)
  }

  const ok = (condition, label, detail = '') => {
    state.checks += 1
    if (condition) {
      say(`  ok    ${label}${detail ? '  ' + detail : ''}`)
      return true
    }
    state.failures += 1
    say(`  FAIL  ${label}${detail ? '  ' + detail : ''}`)
    return false
  }

  const section = (title) => say(`\n[${title}]`)

  return { say, ok, section, state }
}

/** Tolerance for values that went through CSS layout, in px. */
export const near = (a, b, tolerance) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance

export const round2 = (n) => Math.round(n * 100) / 100

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait for a condition instead of sleeping a fixed amount.
 *
 * The suites run under `--virtual-time-budget`, which fast-forwards timers. A fixed
 * `await wait(220)` therefore races IntersectionObserver delivery — the virtual clock
 * jumps past the wait while the observer callback is still queued, so a slide can
 * read as unpainted purely because of how the run was driven. Polling for the
 * observable effect with a real deadline is both deterministic and closer to what a
 * user experiences: the slide appears.
 */
export async function waitFor(predicate, { timeout = 5000, label = 'condition' } = {}) {
  const deadline = performance.now() + timeout
  for (;;) {
    let value
    try {
      value = predicate()
    } catch {
      value = false
    }
    if (value) return value
    if (performance.now() > deadline) {
      throw new Error(`timed out after ${timeout}ms waiting for ${label}`)
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }
}

/** The fixture deck, fetched relative to this module. */
/**
 * Where generated fixtures are fetched from, as a fallback rather than an override.
 *
 * `chart-deck.pptx` lives next to this page and is committed, so the PowerPoint suite
 * is self-contained; the DOCX, XLSX and ODP fixtures are produced by the generators in
 * `scripts/fixtures/` into a scratch directory instead of the repository. The page
 * calls this once with the `?fixtures=` base the runner passes. Local wins, because a
 * committed fixture that silently resolved elsewhere would make the suite test a
 * different deck than the one in the repository.
 */
let fixtureBase = null
export function setFixtureBase(url) {
  fixtureBase = url
}

/** Bytes of a fixture, or `null` when it is in neither place. */
export async function fixtureBytes(name = 'chart-deck.pptx') {
  let response = await fetch(new URL(`./${name}`, import.meta.url))
  if (response.status === 404 && fixtureBase !== null) {
    response = await fetch(new URL(`${fixtureBase}${name}`, import.meta.url))
  }
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(
      `${name} could not be read (${response.status}). Regenerate the fixtures with ` +
      '`python3 scripts/fixtures/make-pptx.py` and `python3 scripts/fixtures/make-docx.py`.'
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}
