/**
 * dsh-model-retry-settings — Host half.
 *
 * Adds one user-owned preference to the web client's **Settings → Model** page:
 * how many times a failed model request may be retried before the turn gives up.
 *
 * ## Why this plugin owns the number
 *
 * dsh resolves a request-retry policy **per provider route**: an adapter's
 * `providerRetryPolicy(provider)` is captured when that route registers
 * (`@deepseek-ai/dsh-llm/retry-policy`), the agent loop carries the resolved
 * policy into the `agent/request-error` waterfall on every failed attempt, and
 * the optional `dsh-llm-retry` plugin executes it as durable `llm/retry` events.
 *
 * The shipped composition therefore lets a person change the retry budget only
 * by editing provider configuration by hand. This plugin owns the preference
 * instead: it rides its own Loader entry's `Config` as its settings namespace
 * (dsh 0.1.7+ makes an entry's Config *be* its settings namespace), and rewrites
 * the policy the executor is about to read.
 *
 * ## How the override lands
 *
 * The listener is registered with `prepend: true`, which makes it the
 * **outermost** holder of the `agent/request-error` waterfall (`ctx.waterfall`
 * composes listeners outermost-first). It therefore runs before
 * `dsh-llm-retry`'s listener, and the substituted policy is what that listener
 * destructures out of the very same payload object.
 *
 * Every mechanical concern — the durable retry counter and its
 * `sessionProjections` state, the backoff schedule, the `llm/retry` /
 * `llm/retry-started` session events the trajectory renders — stays with
 * `dsh-llm-retry`. This plugin changes only the number it enforces. That also
 * means the override has no effect on a deployment that does not compose
 * `dsh-llm-retry`: with no executor, no request is retried at all.
 *
 * Only a `mode: 'normal'` policy carries a `maxRetries`, so an `always` policy
 * is left exactly as its provider declared it, and so is an **absent** policy
 * (a call the loop never prepared already retries nothing).
 *
 * ## Configuration
 *
 * Both fields are `volatile()`. The Loader updates volatile values **in place**
 * on the running fiber (`ConfigEditor.edit` → `resolveConfig` →
 * `updateVolatile`) without rebuilding the fiber or re-entering `apply()`, so
 * the listener below reads the current value on every failure: no subscription,
 * no watcher, and no restart. `settings` is deliberately absent from `inject` —
 * the plugin enforces its default with or without the settings service mounted,
 * and only the *writable* surface in the browser depends on it.
 *
 * @module dsh-model-retry-settings
 */

import z from '@deepseek-ai/schemastery'

/** Stable cordis plugin name. Mirrors the `cordis.patch.yml` insert id. */
export const name = 'model-retry-settings'

/**
 * Services required before this plugin may mount.
 *
 * None. The plugin only registers a listener on an event another plugin
 * dispatches and reads its own config, so it must never be held up — or held
 * back — by the settings service, the web server, or the LLM service.
 */
export const inject = []

/**
 * The retry budget dsh ships with (`DEFAULT_MAX_RETRIES` in
 * `@deepseek-ai/dsh-llm/retry-policy`). Used both as this plugin's default and
 * as the fallback when a hostile value reaches `apply()`.
 */
export const DEFAULT_MAX_RETRIES = 5

/**
 * Largest value the preference accepts, mirrored by the browser field's own
 * validation so a rejected draft is caught before it is written.
 *
 * The schema's `max` and this limit exist to keep a typo from pinning the agent
 * loop on a failing provider for hours; raise it deliberately if you need to.
 */
export const MAX_RETRIES_LIMIT = 50

/**
 * Plugin config — and, because an entry's Config *is* its settings namespace,
 * the `model-retry-settings` section the Model page reads and writes.
 */
export const Config = z.object({
  /**
   * When false, every provider's own retry policy applies untouched and this
   * plugin becomes a no-op. Kept so the preference can be suspended without
   * uninstalling the plugin.
   */
  enabled: z.boolean().default(true).volatile(),
  /**
   * Retries one failed model request may make. `0` disables retrying entirely;
   * the value replaces the provider's own `maxRetries` rather than capping it,
   * so it may both lower and raise a provider's declared budget.
   */
  maxRetries: z
    .number()
    .step(1)
    .min(0)
    .max(MAX_RETRIES_LIMIT)
    .default(DEFAULT_MAX_RETRIES)
    .volatile(),
})

/**
 * Read one config value that may arrive in any of three shapes.
 *
 * A `volatile()` field reaches `apply()` as a live reference whose `.get()`
 * always answers with the current value; a plain field, a legacy config, or a
 * schema-less mount reaches it as a plain value; a field this deployment never
 * composed is absent. Read all three without assuming which one it got — the
 * plugin must keep working on a deployment whose composition it cannot predict.
 *
 * @param config - the raw plugin config handed to `apply()`.
 * @param field - field name inside the config object.
 * @param fallback - value used when the field is absent or reads as undefined.
 * @returns the current value, or `fallback`.
 */
function readConfigValue(config, field, fallback) {
  const holder = config?.[field]
  if (holder === undefined || holder === null) return fallback
  const value = typeof holder.get === 'function' ? holder.get() : holder
  return value === undefined ? fallback : value
}

/**
 * Resolve the preference this plugin is currently enforcing.
 *
 * A value outside the schema's own bounds can only arrive from a hand-edited
 * document or a schema-less mount; falling back to the shipped default keeps
 * the agent loop inside its own contract instead of propagating nonsense.
 *
 * @param config - the raw plugin config handed to `apply()`.
 * @returns whether the override is armed, and the retry budget it enforces.
 */
export function resolveEffectiveConfig(config) {
  const enabled = readConfigValue(config, 'enabled', true) !== false
  const raw = readConfigValue(config, 'maxRetries', DEFAULT_MAX_RETRIES)
  const maxRetries =
    Number.isSafeInteger(raw) && raw >= 0 && raw <= MAX_RETRIES_LIMIT ? raw : DEFAULT_MAX_RETRIES
  return { enabled, maxRetries }
}

/**
 * Mount the retry-policy override.
 *
 * @param ctx - the host plugin context.
 * @param config - the plugin config; every field of interest is volatile.
 */
export function apply(ctx, config) {
  /**
   * Rewrite the policy the rest of the waterfall is about to read.
   *
   * The payload is the plain object `agentEvents(...).waterfall()` built for
   * this dispatch, so replacing `retryPolicy` on it is what the executor
   * downstream observes. A deployment that froze the payload (or the property)
   * must not break the agent loop over a preference, so a refused write is
   * swallowed and the provider's own policy stands.
   */
  const listener = (payload, next) => {
    const { enabled, maxRetries } = resolveEffectiveConfig(config)
    const policy = payload?.retryPolicy
    if (enabled && policy !== undefined && policy.mode === 'normal' && policy.maxRetries !== maxRetries) {
      try {
        payload.retryPolicy = Object.freeze({ ...policy, maxRetries })
      } catch (error) {
        ctx.logger.debug(
          'model-retry-settings: the request-error payload refused the policy override (%s); the provider policy stands',
          String(error),
        )
      }
    }
    return next()
  }

  // `prepend` is load-bearing: the waterfall composes listeners
  // outermost-first, and only an outermost listener runs before the retry
  // executor reads the policy out of the payload.
  ctx.on('agent/request-error', listener, { prepend: true })

  const initial = resolveEffectiveConfig(config)
  ctx.logger.debug(
    'model-retry-settings: %s (maxRetries=%d) — set it on Settings → Model',
    initial.enabled ? 'armed' : 'disarmed',
    initial.maxRetries,
  )
}
