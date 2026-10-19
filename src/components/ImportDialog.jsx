import { useEffect, useRef, useState } from 'react'
import { imageFromPaste, prepareImage } from '../lib/image'
import { mapExtraction } from '../lib/importMap'
import { extractOrdersLocally } from '../lib/localExtract'
import { auDate, parseKey } from '../lib/orders'

export default function ImportDialog({ doc, fallbackDate, onApply, onClose }) {
  const [image, setImage] = useState(null)
  const [fallback, setFallback] = useState(fallbackDate)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const fileInput = useRef(null)

  const takeFile = async file => {
    setError('')
    setResult(null)
    try {
      setImage(await prepareImage(file))
    } catch (err) {
      setImage(null)
      setError(err.message)
    }
  }

  // Paste a screenshot straight into the dialog.
  useEffect(() => {
    const onPaste = event => {
      const file = imageFromPaste(event)
      if (file) {
        event.preventDefault()
        takeFile(file)
      }
    }
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const extract = async () => {
    if (!image) return
    setBusy(true)
    setProgress(0)
    setError('')
    try {
      const extraction = await extractOrdersLocally(image.dataUrl, {
        fallbackDate: fallback,
        onProgress: setProgress,
      })
      setResult(mapExtraction(extraction, doc))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label="Import orders from an image">
        <div className="modal-head">
          <h2 className="flush"><span className="dot" /> Import from image</h2>
          <button className="icon-btn small" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="gate-copy">
          Paste a screenshot of the staff order sheet (Ctrl+V) or choose a file. It is read
          here in the browser and never uploaded. Check the result before anything changes.
        </p>

        <div
          className={`dropzone ${image ? 'filled' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file) takeFile(file)
          }}
          onClick={() => fileInput.current?.click()}
        >
          {image ? (
            <img src={image.dataUrl} alt="Screenshot to import" />
          ) : (
            <span>Paste, drop, or click to choose an image</span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={e => e.target.files?.[0] && takeFile(e.target.files[0])}
          />
        </div>

        {image?.resized && (
          <p className="note">Resized to {image.width}x{image.height} for reading.</p>
        )}

        <div className="week-picker">
          <label htmlFor="import-fallback">If the image has no date, use</label>
          <input
            id="import-fallback"
            type="date"
            value={fallback}
            onChange={e => e.target.value && setFallback(e.target.value)}
          />
          <span className="note">
            Dates are read from headings like "Monday, 12 October 2026". Otherwise {auDate(parseKey(fallback))} is used.
          </span>
        </div>

        {error && <p className="gate-error">{error}</p>}

        {result && (
          <div className="review">
            <h3>Review</h3>
            {result.days.map(day => (
              <div className="review-day" key={day.dateKey}>
                <div className="review-day-head">{day.label}</div>
                <table>
                  <thead>
                    <tr><th>Restaurant</th><th>Dish</th><th>Qty</th></tr>
                  </thead>
                  <tbody>
                    {day.groups.flatMap((group, g) => group.items.map((item, i) => (
                      <tr key={`${g}-${i}`}>
                        <td>{i === 0 ? (group.vendor || <span className="faint">No name</span>) : ''}</td>
                        <td>{item.name}</td>
                        <td className="qty">{item.qty}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            ))}

            {result.notes && <p className="note"><strong>Reader notes:</strong> {result.notes}</p>}

            {result.issues.length > 0 && (
              <div className="issues">
                <strong>Check these before applying</strong>
                <ul>{result.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
              </div>
            )}

            <p className="note">
              Applying replaces the whole order for each day listed above. You can fix any
              misread names in Edit mode afterwards. Nothing is shared with anyone until you sync.
            </p>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={extract} disabled={!image || busy}>
            {busy
              ? `Reading image… ${Math.round(progress * 100)}%`
              : result ? 'Read again' : 'Read image'}
          </button>
          <button
            className="btn btn-primary"
            disabled={!result || result.days.length === 0}
            onClick={() => onApply(result.days)}
          >
            Apply to calendar
          </button>
        </div>
      </div>
    </div>
  )
}
