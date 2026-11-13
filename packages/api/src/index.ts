/**
 * CompbotOrg — HTTP API (v1.0).
 *
 * A zero-external-dependency REST layer over the Company facade. `dispatch`
 * is transport-independent and directly testable; `createServer` adapts it to
 * Node's `http` module.
 *
 * @module @compbotorg/api/index
 */

export {
  createServer,
  dispatch,
  type ApiRequest,
  type ApiResponse,
  type ApiServerOptions,
} from './server'
