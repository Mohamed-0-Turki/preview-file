#!/usr/bin/env node
/**
 * Serve the built package and run the OOXML conformance suite in headless
 * Chrome.
 *
 * The suites exercise real layout, so they need a browser and the *built*
 * `dist/` — which is why this is a script rather than a `node` test. It is a
 * stopgap for the OOXML engine only; the general harness is ADR-0010.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const suite = '/scripts/ooxml-conformance/index.html'
const port = Number(process.env.PORT ?? 8123)

/* `CORPUS=<dir>` audits an external directory of real-world decks instead of the
   committed fixture. The decks are served from `/corpus/` and handed to the page
   as a query string, so nothing about the suite changes — only what it audits. */
const corpusDir = process.env.CORPUS ? resolve(process.env.CORPUS) : undefined
if (corpusDir && !existsSync(corpusDir)) {
  console.error(`CORPUS directory not found: ${corpusDir}`)
  process.exit(1)
}
/* `FIXTURES=<dir>` serves a second directory at `/fixtures/`. The PowerPoint fixture
   is committed next to the suite, but the DOCX, XLSX and ODP fixtures are generated
   into a scratch directory, and the cross-format check needs them from there. */
const fixturesDir = process.env.FIXTURES ? resolve(process.env.FIXTURES) : undefined
if (fixturesDir && !existsSync(fixturesDir)) {
  console.error(`FIXTURES directory not found: ${fixturesDir}`)
  process.exit(1)
}

const corpus = corpusDir
  ? readdirSync(corpusDir)
      .filter((name) => name.endsWith('.pptx'))
      .sort()
      .map((name) => `/corpus/${name}`)
  : []

/* Query string for the page: which corpus to audit, where the generated fixtures
   are, and whether to measure instead of check. Built as a list so the separators
   stay correct no matter which of the three are present. */
const query = new URLSearchParams()
if (corpus.length > 0) query.set('corpus', corpus.map(encodeURIComponent).join(','))
if (fixturesDir !== undefined) query.set('fixtures', '/fixtures')
if (process.env.MEASURE === '1') query.set('measure', '1')

if (!existsSync(join(root, 'dist/ooxml/index.js'))) {
  console.error('dist/ is missing — run `npm run build` first.')
  process.exit(1)
}

const TYPES = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
}

const send = (response, status, body, type) => {
  response.writeHead(status, { 'content-type': type ?? 'text/plain; charset=utf-8' })
  response.end(body)
}

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname))
  // Only the roots the suite imports, plus the corpus root when one was
  // configured; nothing else is reachable.
  const importable = /^\/(dist|node_modules|scripts)\//.test(path)
  const corpusFile = corpusDir !== undefined && path.startsWith('/corpus/')
  const fixtureFile = fixturesDir !== undefined && path.startsWith('/fixtures/')
  if (!importable && path !== suite && !corpusFile && !fixtureFile) {
    send(response, 403, 'forbidden')
    return
  }
  const file = corpusFile
    ? join(corpusDir, path.slice('/corpus/'.length))
    : fixtureFile
      ? join(fixturesDir, path.slice('/fixtures/'.length))
      : join(root, path)
  // Containment is checked against whichever root served the request, so neither a
  // corpus deck nor a generated fixture can be used to walk out of its directory.
  const base = corpusFile ? corpusDir : fixtureFile ? fixturesDir : root
  if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
    send(response, 404, `not found: ${path}`)
    return
  }
  send(response, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream')
})

const browsers = [
  process.env.CHROME,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const browser = browsers.find((candidate) => existsSync(candidate))
if (!browser) {
  console.error('No Chrome or Chromium found. Set CHROME=/path/to/chrome.')
  server.close()
  process.exit(1)
}

server.listen(port, '127.0.0.1', () => {
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1000,900',
      `--virtual-time-budget=${process.env.VIRTUAL_TIME ?? 60000}`,
      '--dump-dom',
      `http://127.0.0.1:${port}${suite}${query.size > 0 ? `?${query}` : ''}`,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
  let dom = ''
  child.stdout.on('data', (chunk) => {
    dom += chunk
  })
  child.on('close', () => {
    server.close()
    // Only the report blocks count. Scraping the whole DOM also matches the
    // page's own inline script, which contains the same marker strings.
    const summary = /<span id="suite"[^>]*>([\s\S]*?)<\/span>/.exec(dom)
    const report = /<pre id="out"[^>]*>([\s\S]*?)<\/pre>/.exec(dom)
    if (process.env.MEASURE === '1') {
      // Measurement mode: emit the raw payload and nothing else, so it can be
      // written straight to a file for the reference diff.
      process.stdout.write(`${(report?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')}\n`)
      /* `process.exit` discards whatever stdout has not flushed yet, which is silent
       * data loss whenever the output is a pipe — `| tee`, or a CI log capture. The
       * report is written with the exit code set and the server closed instead, so
       * the process ends on its own terms once the stream has drained. */
      server.close()
      process.exitCode = 0
      return
    }
    const body = (report?.[1] ?? '').replace(/<[^>]*>/g, '')
    const lines = body.split('\n')
    const failures = lines.filter((line) => line.includes('FAIL  '))
    for (const line of lines) {
      if (line.trimStart().startsWith('ok    ')) console.log(line.trimStart())
    }
    // Measurements are reported after the checks so a failure is never buried in
    // a wall of numbers.
    for (const line of lines) {
      if (line.trimStart().startsWith('\u00b7')) console.log(line.replace(/\s+$/, ''))
    }
    for (const line of failures) console.log(line.trimStart())
    if (/^(ERROR|REJECTION):/.test(body.trim())) {
      console.error(body.trim().slice(0, 1200))
      server.close()
      process.exitCode = 1
      return
    }
    console.log(`\n${summary?.[1]?.replace(/<[^>]*>/g, '').trim() ?? 'the suite did not finish'}`)
    server.close()
    process.exitCode = failures.length === 0 ? 0 : 1
  })
})
