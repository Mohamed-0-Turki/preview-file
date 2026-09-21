import { useEffect, useRef, useState } from 'react'
import { clearPreview, preview } from '@mohamed-0-turki/preview-file'

const MAX_BYTES = 100 * 1024 * 1024

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const card = {
  border: '1px solid #dce1e8',
  borderRadius: '10px',
  background: '#ffffff',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
}

export default function App() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [error, setError] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    return () => {
      if (container) clearPreview(container)
    }
  }, [])

  const handleFileChange = (event) => {
    const next = event.target.files?.[0] ?? null
    event.target.value = ''
    if (containerRef.current) clearPreview(containerRef.current)
    setFile(next)
    setStatus('idle')
    setError('')
  }

  const handlePreview = async () => {
    if (!file || !containerRef.current) return
    setStatus('loading')
    setError('')
    try {
      await preview(file, containerRef.current, { maxBytes: MAX_BYTES })
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err?.message ?? String(err))
    }
  }

  const handleClose = () => {
    if (containerRef.current) clearPreview(containerRef.current)
    setStatus('idle')
    setError('')
  }

  return (
    <main
      style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '24px',
        minHeight: '100vh',
        background: '#eef1f6',
        color: '#172033',
      }}
    >
      <h1 style={{ fontSize: '20px', margin: '0 0 16px' }}>preview-file playground</h1>

      <section
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '12px',
          ...card,
        }}
      >
        <label>
          Select file:{' '}
          <input type="file" onChange={handleFileChange} />
        </label>
        <button type="button" onClick={handlePreview} disabled={!file || status === 'loading'}>
          Preview
        </button>
        <button type="button" onClick={handleClose} disabled={status === 'idle' || status === 'loading'}>
          Close preview
        </button>
      </section>

      <section style={{ marginTop: '12px', padding: '12px', ...card }}>
        <h2 style={{ fontSize: '14px', margin: '0 0 8px' }}>Selected file</h2>
        {file ? (
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>Name: {file.name}</li>
            <li>Size: {formatSize(file.size)}</li>
            <li>Type: {file.type || 'unknown'}</li>
          </ul>
        ) : (
          <p style={{ margin: 0, color: '#57606a' }}>No file selected.</p>
        )}
      </section>

      {status === 'error' && (
        <section
          style={{
            marginTop: '12px',
            padding: '12px',
            border: '1px solid #cf222e',
            borderRadius: '10px',
            background: '#fff5f5',
            color: '#cf222e',
          }}
        >
          <strong>Error:</strong> {error}
        </section>
      )}

      <div
        style={{
          position: 'relative',
          marginTop: '12px',
          height: '70vh',
        }}
      >
        <section
          ref={containerRef}
          style={{
            position: 'absolute',
            inset: '0',
            border: '1px solid #dce1e8',
            borderRadius: '10px',
            overflow: 'hidden',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
          }}
        />
        {status === 'idle' && (
          <p
            style={{
              position: 'absolute',
              inset: '0',
              margin: '0',
              padding: '24px',
              color: '#57606a',
              pointerEvents: 'none',
            }}
          >
            Select a file and click Preview. The package renders its own preview UI here.
          </p>
        )}
      </div>
    </main>
  )
}
