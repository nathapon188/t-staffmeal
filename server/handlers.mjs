import { ApiError, getSnapshot, listSnapshots, loadDoc, saveDoc } from './core.mjs'

/**
 * Transport-agnostic request handlers. The Netlify functions and the Vite dev
 * middleware both call these, so local and production behaviour cannot drift.
 * Each returns { status, body }.
 */

export async function handleOrders({ store, seed, method, ifMatch, body }) {
  if (method === 'GET') {
    return { status: 200, body: await loadDoc(store, seed) }
  }

  if (method === 'PUT') {
    if (!body || typeof body !== 'object') {
      throw new ApiError(400, 'Request body must be a JSON document')
    }
    const saved = await saveDoc(store, body, {
      ifMatch: ifMatch === undefined ? undefined : ifMatch,
      now: new Date().toISOString(),
    })
    return { status: 200, body: saved }
  }

  throw new ApiError(405, `Method ${method} not allowed`)
}

export async function handleSnapshots({ store, id }) {
  if (id) {
    return { status: 200, body: await getSnapshot(store, id) }
  }
  return { status: 200, body: { snapshots: await listSnapshots(store) } }
}

/** Maps a thrown error onto a JSON response body. */
export function errorResponse(err) {
  if (err instanceof ApiError) {
    return { status: err.status, body: { error: err.message } }
  }
  console.error('Unhandled API error:', err)
  return { status: 500, body: { error: 'Unexpected server error' } }
}
