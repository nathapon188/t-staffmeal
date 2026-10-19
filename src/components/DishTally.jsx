import { dishTally, parseKey, weekOf } from '../lib/orders'

/** Every dish ordered this week, totalled per restaurant. */
export default function DishTally({ data, selected }) {
  const tally = dishTally(data, weekOf(parseKey(selected)))

  return (
    <div className="card no-print">
      <h2>Dishes This Week</h2>
      {tally.length === 0 ? (
        <div className="empty">Nothing ordered this week.</div>
      ) : tally.map(({ vendor, dishes }) => (
        <div className="tally-group" key={vendor}>
          <div className="tally-vendor">{vendor}</div>
          {dishes.map(dish => (
            <div className="kv" key={dish.name}>
              <span className="k">{dish.name}</span>
              <span className="v">{dish.qty}</span>
            </div>
          ))}
        </div>
      ))}
      <p className="note mt">Dish names are matched ignoring case, so spell them the same way each day.</p>
    </div>
  )
}
