import { useCallback, useEffect, useMemo, useState } from 'react'
import Calendar from './components/Calendar'
import DayDetail from './components/DayDetail'
import DishTally from './components/DishTally'
import HistoryCard from './components/HistoryCard'
import ImportDialog from './components/ImportDialog'
import KeyGate from './components/KeyGate'
import SyncBar from './components/SyncBar'
import WeekSummary from './components/WeekSummary'
import {
  clearStoredKey, fetchOrders, fetchSnapshot, fetchSnapshots,
  getStoredKey, keyFromUrl, saveOrders, storeKey,
} from './lib/api'
import {
  addGroup, addItem, applyImport, cleanDoc, ensureDay, isDirty, removeDay, removeGroup,
  removeItem, setItem, setVendor,
} from './lib/edit'
import { auDate, dateKey, defaultSelectedDate, parseKey, startOfMonth, weekOf } from './lib/orders'
import { MOBILE_QUERY, useMediaQuery } from './lib/useMediaQuery'

const today = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

const clone = doc => JSON.parse(JSON.stringify(doc))

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') ?? 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])
  return [theme, () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))]
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const isMobile = useMediaQuery(MOBILE_QUERY)

  const [accessKey, setAccessKey] = useState(() => keyFromUrl() || getStoredKey())
  const [doc, setDoc] = useState(null)        // working copy, possibly edited
  const [baseline, setBaseline] = useState(null) // last loaded or synced version
  const [gateError, setGateError] = useState('')
  const [busy, setBusy] = useState(false)

  const [selected, setSelected] = useState(null)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today))
  const [hideZero, setHideZero] = useState(false)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [syncError, setSyncError] = useState('')
  const [snapshots, setSnapshots] = useState([])
  const [importOpen, setImportOpen] = useState(false)

  const dirty = isDirty(doc, baseline)

  // Editing and importing are desktop-only; never leave them on if the
  // viewport shrinks mid-session.
  useEffect(() => {
    if (isMobile) {
      setEditing(false)
      setImportOpen(false)
    }
  }, [isMobile])

  const loadSnapshots = useCallback(key => {
    fetchSnapshots(key).then(setSnapshots).catch(() => setSnapshots([]))
  }, [])

  // Load orders whenever we have a key to try.
  useEffect(() => {
    if (!accessKey) return
    let cancelled = false
    setBusy(true)
    setGateError('')

    fetchOrders(accessKey)
      .then(payload => {
        if (cancelled) return
        storeKey(accessKey)
        setDoc(payload)
        setBaseline(clone(payload))
        const start = defaultSelectedDate(payload, today)
        setSelected(start)
        setViewMonth(startOfMonth(parseKey(start)))
        loadSnapshots(accessKey)
      })
      .catch(err => {
        if (cancelled) return
        clearStoredKey()
        setDoc(null)
        setAccessKey('')
        setGateError(err.message)
      })
      .finally(() => !cancelled && setBusy(false))

    return () => { cancelled = true }
  }, [accessKey, loadSnapshots])

  // Don't let unsynced work vanish on a stray tab close.
  useEffect(() => {
    if (!dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const selectDate = useCallback(key => {
    setSelected(key)
    setViewMonth(startOfMonth(parseKey(key)))
  }, [])

  // Arrow keys step through days (desktop browsing aid).
  useEffect(() => {
    if (!doc || !selected) return
    const onKey = e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.target instanceof HTMLInputElement) return
      const d = parseKey(selected)
      d.setDate(d.getDate() + (e.key === 'ArrowRight' ? 1 : -1))
      selectDate(dateKey(d))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, selected, selectDate])

  const weekLabel = useMemo(() => {
    if (!selected) return ''
    const week = weekOf(parseKey(selected))
    return `Week of ${auDate(week[0])} to ${auDate(week[6])}`
  }, [selected])

  /* ---------------- editing ---------------- */

  const edit = fn => {
    setDoc(current => fn(current))
    setMessage('')
  }

  const actions = {
    setVendor: (groupIndex, vendor) => edit(d => setVendor(d, selected, groupIndex, vendor)),
    setItem: (groupIndex, itemIndex, patch) => edit(d => setItem(d, selected, groupIndex, itemIndex, patch)),
    addItem: groupIndex => edit(d => addItem(d, selected, groupIndex)),
    removeItem: (groupIndex, itemIndex) => edit(d => removeItem(d, selected, groupIndex, itemIndex)),
    addGroup: () => edit(d => addGroup(d, selected)),
    removeGroup: groupIndex => {
      const name = doc.orders[selected]?.[groupIndex]?.vendor || 'this restaurant'
      if (!window.confirm(`Remove ${name} and its dishes from ${auDate(parseKey(selected))}?`)) return
      edit(d => removeGroup(d, selected, groupIndex))
    },
  }

  const handleAddDay = key => edit(d => ensureDay(d, key))

  const handleRemoveDay = key => {
    if (!window.confirm(`Delete the whole order for ${auDate(parseKey(key))}?`)) return
    edit(d => removeDay(d, key))
  }

  /* ---------------- sync ---------------- */

  const handleSave = async () => {
    setSaving(true)
    setSyncError('')
    setMessage('')
    try {
      // Blank dish lines left over from editing are dropped rather than rejected.
      const saved = await saveOrders(accessKey, cleanDoc(doc), baseline.updatedAt ?? null)
      setDoc(saved)
      setBaseline(clone(saved))
      setMessage('Synced. Everyone with the link and key sees this now.')
      loadSnapshots(accessKey)
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    if (!window.confirm('Discard all unsynced changes?')) return
    setDoc(clone(baseline))
    setSyncError('')
    setMessage('Changes discarded.')
  }

  const handleReload = async () => {
    setSaving(true)
    setSyncError('')
    try {
      const fresh = await fetchOrders(accessKey)
      setDoc(fresh)
      setBaseline(clone(fresh))
      setMessage('Reloaded the latest synced version.')
      loadSnapshots(accessKey)
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async id => {
    setSaving(true)
    setSyncError('')
    try {
      const snapshot = await fetchSnapshot(accessKey, id)
      // Keep the current updatedAt so the concurrency check still works.
      setDoc({ ...snapshot, updatedAt: baseline.updatedAt ?? null })
      setMessage('Loaded that version into the editor. Sync to make it live.')
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `staff-orders-${dateKey(today)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleApplyImport = days => {
    setDoc(current => applyImport(current, days))
    setImportOpen(false)
    setEditing(true)
    selectDate(days[0].dateKey)
    setMessage(`Applied ${days.length} day${days.length === 1 ? '' : 's'} from the image. Check them, then sync.`)
  }

  if (!doc) {
    return <KeyGate onSubmit={setAccessKey} error={gateError} busy={busy} />
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Staff Meal Orders</h1>
          <div className="sub">{weekLabel}</div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>

      <div className="layout">
        <div className="col">
          <Calendar
            data={doc}
            viewMonth={viewMonth}
            setViewMonth={setViewMonth}
            selected={selected}
            onSelect={selectDate}
            today={today}
          />
          <WeekSummary data={doc} selected={selected} onSelect={selectDate} />
          {!isMobile && <DishTally data={doc} selected={selected} />}
        </div>

        <div className="col">
          <SyncBar
            readOnly={isMobile}
            editing={editing}
            setEditing={setEditing}
            dirty={dirty}
            saving={saving}
            updatedAt={baseline?.updatedAt}
            message={message}
            error={syncError}
            onSave={handleSave}
            onDiscard={handleDiscard}
            onImport={() => setImportOpen(true)}
            onExport={handleExport}
            onReload={handleReload}
          />

          <DayDetail
            data={doc}
            selected={selected}
            hideZero={hideZero}
            setHideZero={setHideZero}
            editing={editing}
            actions={actions}
            onAddDay={handleAddDay}
            onRemoveDay={handleRemoveDay}
          />

          {isMobile && <DishTally data={doc} selected={selected} />}
          {!isMobile && <HistoryCard snapshots={snapshots} busy={saving} onRestore={handleRestore} />}
        </div>
      </div>

      {importOpen && !isMobile && (
        <ImportDialog
          doc={doc}
          fallbackDate={selected}
          onApply={handleApplyImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  )
}
