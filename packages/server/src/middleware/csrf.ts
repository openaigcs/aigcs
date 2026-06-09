import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

export const csrfProtection = createMiddleware(async (c, next) => {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE']
  if (!mutatingMethods.includes(c.req.method)) return next()

  const requestedWith = c.req.header('X-Requested-With')
  if (requestedWith !== 'XMLHttpRequest') {
    throw new HTTPException(403, { message: 'CSRF protection: X-Requested-With header required' })
  }

  return next()
})
