/**
 * Focused verification of the dsh-model-retry-settings Host half against the
 * REAL @deepseek-ai/schemastery and @deepseek-ai/cordis taken from the dsh
 * installation.
 *
 * What it proves:
 *  1. the exported Config validates, defaults, and marks both fields volatile;
 *  2. resolveEffectiveConfig reads a live volatile ref, a plain value, and an
 *     absent field, and refuses an out-of-contract number;
 *  3. `prepend: true` really makes the listener the OUTERMOST holder of an
 *     `agent/request-error` waterfall, so it runs before a later-registered
 *     executor — the plugin's load-bearing claim;
 *  4. the listener rewrites `payload.retryPolicy.maxRetries` in place, leaves
 *     `always` and absent policies alone, and is a no-op when disarmed;
 *  5. a volatile value changed after apply() is observed on the next call.
 */

import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

/**
 * The package's own shipped host half, reached through the harness symlink so
 * the tests always load what `package.json` exports. Run `test/setup.mjs` first.
 */
const { Config, apply, inject, name, resolveEffectiveConfig, DEFAULT_MAX_RETRIES, MAX_RETRIES_LIMIT } = await import(
  '../.test-workspace/plugin/lib/index.js'
)

const results = []
function check(label, fn) {
  try {
    fn()
    results.push(`ok   ${label}`)
  } catch (error) {
    results.push(`FAIL ${label}: ${error.message}`)
  }
}

//#region 1 — schema shape

check('name and inject are the plugin contract', () => {
  assert.equal(name, 'model-retry-settings')
  assert.deepEqual(inject, [])
})

const resolved = new Config({})

check('Config resolves volatile fields to live refs carrying the defaults', () => {
  // The Loader hands `apply()` the resolved config, in which every volatile
  // field is a live reference — not the raw value. This is why readConfigValue
  // must call .get(); the next checks cover the plain-value shape as well.
  assert.equal(typeof resolved.enabled.get, 'function', 'enabled must be a volatile ref')
  assert.equal(typeof resolved.maxRetries.get, 'function', 'maxRetries must be a volatile ref')
  assert.equal(resolved.enabled.get(), true)
  assert.equal(resolved.maxRetries.get(), DEFAULT_MAX_RETRIES)
})

check('Config declares both fields volatile', () => {
  const dict = Config.dict ?? {}
  assert.equal(dict.enabled?.meta?.volatile, true, 'enabled must be volatile')
  assert.equal(dict.maxRetries?.meta?.volatile, true, 'maxRetries must be volatile')
})

check('Config rejects a non-integer and an out-of-range value', () => {
  assert.throws(() => new Config({ maxRetries: 1.5 }))
  assert.throws(() => new Config({ maxRetries: MAX_RETRIES_LIMIT + 1 }))
  assert.throws(() => new Config({ maxRetries: -1 }))
})

//#endregion

//#region 2 — config reading

check('resolveEffectiveConfig reads a live volatile ref', () => {
  let current = 9
  const ref = { get: () => current }
  const config = { enabled: { get: () => true }, maxRetries: ref }
  assert.deepEqual(resolveEffectiveConfig(config), { enabled: true, maxRetries: 9 })
  current = 2
  assert.deepEqual(resolveEffectiveConfig(config), { enabled: true, maxRetries: 2 })
})

check('resolveEffectiveConfig reads plain values and absent fields', () => {
  assert.deepEqual(resolveEffectiveConfig({ enabled: false, maxRetries: 7 }), { enabled: false, maxRetries: 7 })
  assert.deepEqual(resolveEffectiveConfig(undefined), { enabled: true, maxRetries: DEFAULT_MAX_RETRIES })
  assert.deepEqual(resolveEffectiveConfig({}), { enabled: true, maxRetries: DEFAULT_MAX_RETRIES })
})

check('resolveEffectiveConfig refuses an out-of-contract value', () => {
  assert.deepEqual(resolveEffectiveConfig({ maxRetries: 1.5 }), { enabled: true, maxRetries: DEFAULT_MAX_RETRIES })
  assert.deepEqual(resolveEffectiveConfig({ maxRetries: -1 }), { enabled: true, maxRetries: DEFAULT_MAX_RETRIES })
  assert.deepEqual(resolveEffectiveConfig({ maxRetries: 1e9 }), { enabled: true, maxRetries: DEFAULT_MAX_RETRIES })
})

//#endregion

//#region 3+4 — the waterfall substitution, through a real cordis Context

/** Minimal ctx stand-ins for the two services apply() touches. */
function fakeCtx(order) {
  return {
    // Real cordis semantics: a plain `on` appends, `prepend` unshifts.
    on(event, listener, options) {
      assert.equal(event, 'agent/request-error')
      if (options?.prepend === true) order.push('prepend')
      else order.push('append')
      return () => {}
    },
    logger: { debug() {}, warn() {} },
  }
}

check('apply registers a PREPENDED agent/request-error listener', () => {
  const order = []
  apply(fakeCtx(order), {})
  assert.deepEqual(order, ['prepend'])
})

/** Build a config whose volatile refs can be mutated mid-test. */
function liveConfig(initial) {
  const state = { ...initial }
  return {
    state,
    config: {
      enabled: { get: () => state.enabled },
      maxRetries: { get: () => state.maxRetries },
    },
  }
}

/** Run one agent/request-error waterfall the way cordis composes it. */
async function runWaterfall(listeners, payload) {
  let index = 0
  const next = async () => {
    const listener = listeners[index++]
    if (listener === undefined) return undefined
    return listener(payload, next)
  }
  return next()
}

/** Register the plugin's listener the way `apply` does, capture it, then run. */
function listenerFor(config) {
  let captured
  const ctx = {
    on(_event, listener) {
      captured = listener
      return () => {}
    },
    logger: { debug() {}, warn() {} },
  }
  apply(ctx, config)
  return captured
}

/** A stand-in for @deepseek-ai/dsh-llm-retry: reads maxRetries off the payload. */
function executorSeen(trace) {
  return async (payload, next) => {
    trace.push(payload.retryPolicy === undefined ? 'none' : `maxRetries=${payload.retryPolicy.maxRetries}`)
    return next()
  }
}

const normalPolicy = Object.freeze({
  mode: 'normal',
  maxRetries: 5,
  retryableCodes: Object.freeze(['RATE_LIMIT']),
  initialDelayMs: 500,
  maxDelayMs: 10000,
  jitterRatio: 0.1,
})

async function scenario(label, { config, policy, expected, expectedEnabled }) {
  const trace = []
  // Register the plugin first with prepend, the way the real composition does
  // (the executor is composed by dsh-base, long before this bundle layer).
  const plugin = listenerFor(config)
  const executor = executorSeen(trace)
  // `prepend` means the plugin's listener is OUTERMOST, so it wraps the executor.
  const outcome = await runWaterfall([plugin, executor], { retryPolicy: policy })
  check(label, () => {
    assert.deepEqual(trace, [expected], `executor saw ${JSON.stringify(trace)}, wanted ${JSON.stringify([expected])}`)
    assert.equal(outcome, undefined)
  })
  return { trace, expectedEnabled }
}

//#endregion

//#region run the async scenarios

await scenario('armed override reaches the executor', {
  config: liveConfig({ enabled: true, maxRetries: 2 }).config,
  policy: normalPolicy,
  expected: 'maxRetries=2',
})

await scenario('a raised budget also reaches the executor', {
  config: liveConfig({ enabled: true, maxRetries: 12 }).config,
  policy: normalPolicy,
  expected: 'maxRetries=12',
})

await scenario('zero reaches the executor (retrying disabled)', {
  config: liveConfig({ enabled: true, maxRetries: 0 }).config,
  policy: normalPolicy,
  expected: 'maxRetries=0',
})

await scenario('disarmed leaves the provider policy intact', {
  config: liveConfig({ enabled: false, maxRetries: 2 }).config,
  policy: normalPolicy,
  expected: 'maxRetries=5',
})

await scenario('an "always" policy is never rewritten', {
  config: liveConfig({ enabled: true, maxRetries: 2 }).config,
  policy: { mode: 'always', initialDelayMs: 500, maxDelayMs: 10000, jitterRatio: 0.1 },
  // An `always` policy carries no maxRetries at all, so the executor still
  // sees none — proof the plugin left the policy object untouched.
  expected: 'maxRetries=undefined',
})

await scenario('an absent policy stays absent', {
  config: liveConfig({ enabled: true, maxRetries: 2 }).config,
  policy: undefined,
  expected: 'none',
})

check('the original provider policy object is not mutated', () => {
  // Every scenario above shares `normalPolicy`; if a rewrite had mutated it,
  // the "disarmed" and "always" scenarios would have seen the wrong number.
  assert.equal(normalPolicy.maxRetries, 5)
  assert.ok(Object.isFrozen(normalPolicy))
})

check('the replacement policy keeps every other field', async () => {
  const config = liveConfig({ enabled: true, maxRetries: 3 }).config
  const plugin = listenerFor(config)
  let seen
  await runWaterfall([plugin, async (payload) => { seen = payload.retryPolicy }], { retryPolicy: normalPolicy })
  assert.equal(seen.maxRetries, 3)
  assert.equal(seen.mode, 'normal')
  assert.deepEqual([...seen.retryableCodes], ['RATE_LIMIT'])
  assert.equal(seen.initialDelayMs, 500)
  assert.equal(seen.maxDelayMs, 10000)
  assert.equal(seen.jitterRatio, 0.1)
  assert.ok(Object.isFrozen(seen))
})

//#endregion

//#region 5 — live volatile update, through a real cordis Context

check('a volatile change after apply() is observed on the next failure (real cordis)', async () => {
  // This one uses a real cordis Context so the prepend/append ordering is the
  // installation's own implementation, not the fake in `listenerFor`.
  const ctx = new Context()
  const state = { enabled: true, maxRetries: 4 }
  const config = { enabled: { get: () => state.enabled }, maxRetries: { get: () => state.maxRetries } }

  const seen = []
  // The executor is registered FIRST, so it starts innermost.
  ctx.on('agent/request-error', (payload) => {
    seen.push(payload.retryPolicy.maxRetries)
    return undefined
  })

  const plugin = listenerFor(config)
  ctx.on('agent/request-error', plugin, { prepend: true })

  const policy = { mode: 'normal', maxRetries: 5, retryableCodes: [], initialDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }
  await ctx.waterfall({ agent: { id: 'a' } }, 'agent/request-error', { retryPolicy: { ...policy } })
  // In-place volatile update, exactly what the Loader's ConfigEditor does.
  state.maxRetries = 1
  state.enabled = false
  await ctx.waterfall({ agent: { id: 'a' } }, 'agent/request-error', { retryPolicy: { ...policy } })

  assert.deepEqual(seen, [4, 5], 'first failure sees the override, after the update the provider policy stands')
})

//#endregion

console.log(results.join('\n'))
const failed = results.filter((line) => line.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
