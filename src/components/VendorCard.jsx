import { groupTotal, plural } from '../lib/orders'

export default function VendorCard({ group, groupIndex, hideZero, editing, actions }) {
  const total = groupTotal(group)
  const indexed = group.items.map((item, index) => ({ item, index }))
  // Hiding zero rows while editing would hide the inputs you need.
  const visible = hideZero && !editing ? indexed.filter(({ item }) => item.qty > 0) : indexed

  return (
    <div className="card">
      <div className="slot-head">
        {editing ? (
          <input
            className="text-input vendor-input"
            value={group.vendor}
            placeholder="Restaurant name"
            aria-label="Restaurant name"
            onChange={e => actions.setVendor(groupIndex, e.target.value)}
          />
        ) : (
          <h2 className="flush"><span className="dot" /> {group.vendor || 'Unnamed restaurant'}</h2>
        )}
        <span className="pill">{plural(total, 'meal')}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Dish</th>
            <th>Qty</th>
            {editing && <th aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td colSpan={editing ? 3 : 2} className="none">No dishes from this restaurant.</td></tr>
          ) : visible.map(({ item, index }) => (
            <tr key={index} className={item.qty ? '' : 'zero'}>
              <td>
                {editing ? (
                  <input
                    className="text-input"
                    value={item.name}
                    placeholder="Dish"
                    aria-label={`Dish ${index + 1} name`}
                    onChange={e => actions.setItem(groupIndex, index, { name: e.target.value })}
                  />
                ) : item.name}
              </td>
              <td className="qty">
                {editing ? (
                  <input
                    className="qty-input"
                    type="number"
                    min="0"
                    max="9999"
                    step="1"
                    value={item.qty}
                    aria-label={`${item.name || `Dish ${index + 1}`}, quantity`}
                    onChange={e => actions.setItem(groupIndex, index, { qty: Number(e.target.value) })}
                    onFocus={e => e.target.select()}
                  />
                ) : item.qty}
              </td>
              {editing && (
                <td>
                  <button
                    className="icon-btn small"
                    onClick={() => actions.removeItem(groupIndex, index)}
                    title="Remove dish"
                    aria-label={`Remove ${item.name || 'dish'}`}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Restaurant total</td>
            <td className="qty accent">{total}</td>
            {editing && <td />}
          </tr>
        </tfoot>
      </table>

      {editing && (
        <div className="toolbar mt no-print">
          <button className="btn" onClick={() => actions.addItem(groupIndex)}>Add dish</button>
          <button className="btn btn-danger" onClick={() => actions.removeGroup(groupIndex)}>
            Remove restaurant
          </button>
        </div>
      )}
    </div>
  )
}
