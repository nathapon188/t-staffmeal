import seed from '../../data/orders.json'
import { errorResponse, handleOrders } from '../../server/handlers.mjs'
import { json, readIfMatch, rejectUnauthorised } from '../../server/http.mjs'
import { createBlobStore } from '../../server/store-blobs.mjs'

export default async (req) => {
  const rejected = rejectUnauthorised(req)
  if (rejected) return rejected

  try {
    const result = await handleOrders({
      store: createBlobStore(),
      seed,
      method: req.method,
      ifMatch: readIfMatch(req),
      body: req.method === 'PUT' ? await req.json().catch(() => null) : undefined,
    })
    return json(result.body, result.status)
  } catch (err) {
    const { status, body } = errorResponse(err)
    return json(body, status)
  }
}

export const config = { path: '/api/orders' }
