import { preview } from '../../dist/index.js'
import { fixtureBytes, reporter, wait } from './harness.js'

/**
 * Every format the package claims to open, rendered through the public entry point.
 *
 * Each input is a real `File`, because that is what a caller has: a bare string is
 * treated as a URL to fetch, and passing bytes or source text directly would be
 * testing a path the public API does not offer.
 *
 * The PowerPoint engine is a large, self-contained addition, and the ways it could
 * break its neighbours live in shared code: the type dispatch in `preview`, the
 * registry, and the archive plumbing. A failure there is invisible to a
 * PowerPoint-only suite — the PPTX checks pass while DOCX quietly stops opening — so
 * this guards the promise the README makes.
 *
 * Each format is checked by a distinctive string of its own text rather than by a
 * class name. Class names are an internal detail that a refactor may rename, while
 * the words in a fixture only change when the fixture changes, and finding the text
 * also proves the bytes were decoded rather than merely displayed.
 */
const FORMATS = [
  { name: 'docx', fixture: 'rich-text.docx', expect: 'Rich text fixture' },
  { name: 'xlsx', fixture: 'charts.xlsx', expect: 'Series A' },
  { name: 'pptx', fixture: 'chart-deck.pptx', expect: 'Shape and text fidelity' },
  { name: 'markdown', file: 'notes.md', inline: '# Heading\n\nBody with **bold** and a [link](https://example.com).\n', expect: 'Heading' },
  { name: 'json', file: 'data.json', inline: '{"name":"preview-file","values":[1,2,3],"nested":{"ok":true}}', expect: 'preview-file' },
  { name: 'csv', file: 'table.csv', inline: 'stage,input,output\ndesign,12,18\nbuild,7,9\n', expect: 'design' },
  { name: 'svg', file: 'logo.svg', inline: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#123A63"/></svg>' },
  { name: 'png', file: 'pixel.png', bytes: pngPixel() },
  /* ODF presentations are not rendered in the browser by design, so the expectation
   * is the notice that says so. A silent blank box would also satisfy "it did not
   * crash", which is why this one is spelled out rather than left to the default. */
  { name: 'fodp (unsupported by design)', fixture: 'deck.fodp', expect: 'Preview unavailable' },
]

/** A one-pixel PNG, built rather than committed so the fixture list stays small. */
function pngPixel() {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

/** Whether a generated fixture is present, without failing the run when it is not. */
async function fixtureExists(name) {
  try {
    return (await fixtureBytes(name)) !== null
  } catch {
    return false
  }
}

/**
 * MIME types as a browser would report them.
 *
 * `preview` picks a previewer from the file's type, so a `File` built without one
 * arrives as `application/octet-stream` and is refused — which is correct, and is
 * why a dropped file with an unhelpful type gets an error rather than a preview.
 */
const MIME = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.fodp': 'application/vnd.oasis.opendocument.presentation',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

export async function runFormats(lines) {
  const { say, ok, section, state } = reporter(lines)

  section('every advertised format still renders through preview()')
  for (const format of FORMATS) {
    /* The generated fixtures live outside the repository. When the runner was not
     * pointed at a fixture directory those formats are reported as skipped rather
     * than failed, so the PowerPoint suite stays self-contained on a fresh clone. */
    if (format.fixture && format.fixture !== 'chart-deck.pptx') {
      const available = await fixtureExists(format.fixture)
      if (!available) {
        say(`  \u00b7 ${format.name.padEnd(9)} skipped \u2014 ${format.fixture} is not in the fixture directory`)
        continue
      }
    }
    const host = document.createElement('div')
    host.style.cssText = 'position:relative;width:960px;height:600px'
    document.body.appendChild(host)
    try {
      const bytes = format.bytes ?? format.inline ?? (await fixtureBytes(format.fixture))
      if (!bytes) throw new Error(`${format.fixture} was not found in the fixture directory`)
      const name = format.fixture ?? format.file
      const type = MIME[name.slice(name.lastIndexOf('.'))]
      await preview(new File([bytes], name, type ? { type } : undefined), host)
      await wait(200)
      const banner = host.querySelector('.pf-error, .pf-unsupported, [class*="error"]')
      const text = (host.textContent ?? '').replace(/\s+/g, ' ')
      const found = format.expect ? text.includes(format.expect) : true
      ok(!banner && host.querySelectorAll('*').length > 1 && found,
        `${format.name} renders`,
        `${host.querySelectorAll('*').length} nodes${banner ? ', error banner shown' : ''}` +
        `${format.expect && !found ? `, ${JSON.stringify(format.expect)} absent` : ''}`)
    } catch (error) {
      ok(false, `${format.name} renders`, String(error && error.message ? error.message : error))
    }
    host.remove()
  }

  /* A file the package does not claim to open has to do both halves of its contract:
   * leave a card in the container that offers a download, and reject so the caller
   * knows. Either half alone is a bug — a silent container leaves the user staring at
   * a blank box, and a bare rejection with nothing rendered gives them no way forward
   * except to notice the failure themselves. */
  {
    const host = document.createElement('div')
    document.body.appendChild(host)
    let threw = null
    try {
      await preview(new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'mystery.bin'), host)
      await wait(150)
    } catch (error) {
      threw = error
    }
    const text = (host.textContent ?? '').replace(/\s+/g, ' ').trim()
    ok(threw !== null, 'an unhandled type rejects', threw ? '' : 'preview() resolved')
    ok(/no previewer registered/i.test(threw?.message ?? ''),
      'the rejection names the reason', String(threw?.message ?? threw).slice(0, 80))
    ok(/download/i.test(text), 'the container still offers the file',
      text.slice(0, 70) || '(nothing rendered)')
    say(`  · unknown format            ${text.slice(0, 60)}`)
    host.remove()
  }

  return state.checks
}
