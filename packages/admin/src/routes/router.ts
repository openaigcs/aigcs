import { Route as rootRoute } from './__root'
import { Route as indexRoute } from './index'
import { Route as loginRoute } from './login'
import { Route as sitesRoute } from './sites/index'
import { Route as siteDetailRoute } from './sites/$siteId/index'
import { Route as createProviderRoute } from './sites/$siteId/providers/new'
import { Route as promptsRoute } from './prompts'
import { Route as settingsRoute } from './settings'
import { Route as profileRoute } from './profile'
import { Route as auditLogRoute } from './audit-log'
import { Route as usersRoute } from './users'
import { Route as cacheRoute } from './cache'
import { Route as pluginsRoute } from './plugins'
import { Route as providersRoute } from './providers'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  sitesRoute,
  siteDetailRoute,
  createProviderRoute,
  providersRoute,
  promptsRoute,
  pluginsRoute,
  cacheRoute,
  usersRoute,
  settingsRoute,
  profileRoute,
  auditLogRoute,
])
