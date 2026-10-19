import { DOW_FULL, auDate, dayGroups, dayTotals, dowIndex, hasOrder, parseKey, plural } from '../lib/orders'
import VendorCard from './VendorCard'

export default function DayDetail({
  data, selected, hideZero, setHideZero, editing, actions, onAddDay, onRemoveDay,
}) {
  const date = parseKey(selected)
  const totals = dayTotals(data, selected)
  const ordered = hasOrder(data, selected)
  const groups = dayGroups(data, selected)
  const dayExists = Boolean(data.orders[selected])

  return (
    <>
      <div className="card">
        <div className="detail-head">
          <div>
            <div className="date">{DOW_FULL[dowIndex(date)]} {auDate(date)}</div>
            <div className="meta">
              {dayExists
                ? `${plural(groups.length, 'restaurant')} · ${plural(totals.dishes, 'dish line')}`
                : 'No order recorded for this day'}
            </div>
          </div>
          <div className="stats">
            <div className="stat"><div className="label">Restaurants</div><div className="value">{totals.vendors}</div></div>
            <div className="stat"><div className="label">Dishes</div><div className="value">{totals.dishes}</div></div>
            <div className="stat"><div className="label">Meals</div><div className="value accent">{totals.meals}</div></div>
          </div>
        </div>
      </div>

      {dayExists ? (
        <div className="slots">
          {groups.map((group, index) => (
            <VendorCard
              key={index}
              group={group}
              groupIndex={index}
              hideZero={hideZero}
              editing={editing}
              actions={actions}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty">
            <strong>Nothing scheduled</strong>
            {editing
              ? 'Add an order for this day to start entering dishes.'
              : 'Pick a highlighted day on the calendar, or switch on Edit to add one.'}
          </div>
          {editing && (
            <button className="btn btn-primary mt" onClick={() => onAddDay(selected)}>
              Add order for {auDate(date)}
            </button>
          )}
        </div>
      )}

      <div className="card no-print">
        <div className="toolbar">
          <label>
            <input
              type="checkbox"
              checked={hideZero}
              disabled={editing}
              onChange={e => setHideZero(e.target.checked)}
            />
            Hide zero-quantity dishes
          </label>
          <button className="btn" onClick={() => window.print()}>Print day sheet</button>
          {editing && dayExists && (
            <button className="btn" onClick={actions.addGroup}>Add restaurant</button>
          )}
          {editing && dayExists && (
            <button className="btn btn-danger" onClick={() => onRemoveDay(selected)}>
              Delete this day
            </button>
          )}
          {ordered || !editing ? null : <span className="note">Nothing ordered yet for this day.</span>}
        </div>
      </div>
    </>
  )
}
