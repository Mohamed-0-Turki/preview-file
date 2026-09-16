# preview-file playground

A minimal React + Vite dev playground for manually testing the `preview-file`
package during development.

## Setup

```bash
cd playground
npm install
```

The playground consumes the local package via a `file:..` dependency, so no
published npm version is used. The package must be built (`dist/`) before the
bundler can load it; `npm run dev` does this automatically via the `predev`
script. To build manually from the repository root:

```bash
npm run build
```

## Run

```bash
npm run dev
```

This rebuilds the package (if needed) and starts Vite at http://localhost:5173.

## Test

- Select a supported file (PDF, Word, Excel, CSV, text, image) and click
  **Preview** — the package renders its own preview UI in the container.
- Change/select another file any time and preview it again.
- Select an unsupported or corrupt file to exercise the package's error UI.
- Click **Close preview** to tear down the current preview (`clearPreview`).

The code imports only the package's public API: `preview()` and
`clearPreview()`.