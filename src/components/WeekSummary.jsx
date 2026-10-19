import { DOW_SHORT, auDate, dateKey, dayTotals, dowIndex, hasOrder, parseKey, plural, weekOf } from '../lib/orders'

export default function WeekSummary({ data, selected, onSelect }) {
  const week = weekOf(parseKey(selected))
  const ordered = week.filter(d => hasOrder(data, dateKey(d)))
  const total = ordered.reduce((s, d) => s + dayTotals(data, dateKey(d)).meals, 0)

  return (
    <div className="card">
      <h2><span className="dot" /> Week Summary</h2>

      {ordered.length === 0 ? (
        <div className="empty">No orders recorded for this week.</div>
      ) : (
        <>
          {ordered.map(d => {
            const key = dateKey(d)
            const vendors = data.orders[key].map(g => g.vendor).filter(Boolean).join(', ')
            return (
              <button
                key={key}
                className={`kv clickable ${key === selected ? 'active' : ''}`}
                onClick={() => onSelect(key)}
              >
                <span className="k">
                  {DOW_SHORT[dowIndex(d)]} {auDate(d)}
                  {vendors && <span className="sub-k">{vendors}</span>}
                </span>
                <span className="v">{plural(dayTotals(data, key).meals, 'meal')}</span>
              </button>
            )
          })}
          <div className="kv total-row">
            <span className="k">Week total</span>
            <span className="v accent">{plural(total, 'meal')}</span>
          </div>
        </>
      )}
    </div>
  )
}
