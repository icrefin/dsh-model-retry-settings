/**
 * Focused verification of the dsh-model-retry-settings browser half.
 *
 * The bundle is loaded through a stand-in `window.__ModuleLoader__` — the
 * loader's own contract — then materialized with a `require` that maps the
 * platform seeds to the REAL packages extracted from the dsh installation
 * (`react`, `react-dom`, and `@deepseek-ai/dsh-client-ui-primitives`, whose
 * browser-only imports `dsh-hooks.mjs` stubs).
 *
 * What it proves:
 *  1. the bundle registers one factory under the package-name id the boot graph
 *     row carries, and injects one claimed stylesheet at materialization;
 *  2. `apply()` binds the right namespace, registers the locale dictionary,
 *     waits for the Models-page footer slot, and gates the card on the
 *     namespace being served;
 *  3. the injected face is exactly what the renderer's `inject` contract
 *     produces — `hooks.modelRetryCard` becomes `props.useModelRetryCard`;
 *  4. the card renders through react-dom/server with the real primitives and
 *     shows the effective retry budget;
 *  5. every draft rule of the card's field specs: staged whole numbers become
 *     `set` ops, an empty/reset draft becomes `unset`, and an out-of-range or
 *     fractional draft blocks the save instead of reaching the Host.
 */

import assert from 'node:assert/strict'
import { jsx, jsxs } from 'react/jsx-runtime'
import React from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector.js'

const results = []
async function check(label, fn) {
  try {
    await fn()
    results.push(`ok   ${label}`)
  } catch (error) {
    results.push(`FAIL ${label}: ${error.message}`)
  }
}

//#region DOM stub — enough for the primitives to initialize

const styleTags = []

/** A permissive element stand-in covering what the primitives touch at init. */
function makeElement(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    id: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(name, value) {
      node.attributes[name] = String(value)
      if (name === 'id') node.id = String(value)
    },
    getAttribute(name) {
      return Object.hasOwn(node.attributes, name) ? node.attributes[name] : null
    },
    removeAttribute(name) {
      delete node.attributes[name]
    },
    append(...nodes) {
      node.children.push(...nodes)
      for (const child of nodes) if (child?.tagName === 'STYLE') styleTags.push(child)
    },
    appendChild(child) {
      node.children.push(child)
      return child
    },
    insertBefore(child) {
      node.children.push(child)
      return child
    },
    remove() {},
    removeChild() {},
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    scrollIntoView() {},
    closest: () => null,
    matches: () => false,
  }
  return node
}

const head = makeElement('head')
const body = makeElement('body')

globalThis.document = {
  head,
  body,
  documentElement: makeElement('html'),
  createElement: makeElement,
  createTextNode: (text) => ({ textContent: text }),
  getElementById: (id) => styleTags.find((tag) => tag.id === id) ?? null,
  querySelector: () => null,
  querySelectorAll: (selector) => (selector === 'style:not([data-plugin])' ? styleTags : []),
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
}
globalThis.window = globalThis
globalThis.window.addEventListener = () => {}
globalThis.window.removeEventListener = () => {}
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' })
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

//#endregion

//#region 1 — capture the factory through the loader contract

let definition
globalThis.window.__ModuleLoader__ = {
  load(def) {
    definition = def
  },
  require() {},
  create() {},
}

await import('../.test-workspace/plugin/lib/client.js')

await check('the bundle registers exactly one factory', () => {
  assert.ok(definition, 'window.__ModuleLoader__.load was never called')
  assert.equal(definition.id, 'dsh-model-retry-settings', 'the id must match the boot graph row')
  assert.equal(typeof definition.factory, 'function')
})

await check('registering a factory injects nothing yet (lazy materialization)', () => {
  assert.equal(styleTags.length, 0, 'the loader registers factories; module bodies run at materialization')
})

const primitives = await import('@deepseek-ai/dsh-client-ui-primitives')
const requireShim = (spec) => {
  if (spec === 'react') return React
  if (spec === 'react/jsx-runtime') return { jsx, jsxs }
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`the bundle required an undeclared module: ${spec}`)
}

const exports_ = definition.factory(requireShim)

await check('materialization injected one stylesheet, left untagged for the loader to claim', () => {
  assert.equal(styleTags.length, 1, 'expected exactly one <style> tag')
  assert.match(styleTags[0].textContent, /\.dmrs-card/)
  // Untagged is correct: claimStyles tags untagged styles with the materializing
  // plugin so they are removed with the bundle.
  assert.equal(styleTags[0].getAttribute('data-plugin'), null)
})

await check('the bundle exports the cordis plugin contract', () => {
  assert.equal(typeof exports_.apply, 'function')
  assert.deepEqual(exports_.inject, ['slots', 'locale', 'configForms'])
})

//#endregion

//#region the renderer's own inject binding, replicated

/**
 * `bindInjectSources` + `standardHookPropName` from the renderer: a `hooks`
 * entry becomes `props.use<Name>` backed by the snapshot source. Replicated
 * here (the renderer does not export it) so the test drives the card through
 * the same prop shape the real slot renderer produces.
 */
function bindInjectSources(face) {
  const sources = face.hooks
  const { hooks: _hooks, keyedHooks: _keyedHooks, ...rest } = face
  for (const [name, source] of Object.entries(sources ?? {})) {
    const hookName = `use${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`
    rest[hookName] = function useSelector(selector, equality) {
      return useSyncExternalStoreWithSelector(
        (listener) => source.subscribe(listener),
        () => source.getSnapshot(),
        // The renderer passes `undefined` here (its hooks only ever run in the
        // browser). This test renders with react-dom/server, which requires a
        // server snapshot, so it supplies the same read.
        () => source.getSnapshot(),
        selector,
        equality,
      )
    }
  }
  return rest
}

//#endregion

//#region a mount harness

/** Snapshot a namespace value the way the Host settings document would. */
function scopeFor(value, base = value) {
  const listeners = new Set()
  let snapshot = { status: 'ready', value, base, user: undefined, revision: 1, writable: true, mode: 'host' }
  return {
    writes: [],
    setSnapshot(next) {
      snapshot = next
    },
    mutate(ops, revision) {
      this.writes.push({ ops, revision })
      return true
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** A ctx that records what apply() asks of every service. */
function clientCtx(scope) {
  const record = { effects: [], registered: [], injected: [], whileServed: [], locale: [], warned: [] }
  return {
    record,
    ctx: {
      logger: { warn: (...args) => record.warned.push(args) },
      effect(fn) {
        const disposer = fn()
        record.effects.push(disposer)
        return typeof disposer === 'function' ? disposer : () => {}
      },
      locale: {
        register(ns, dicts) {
          record.locale.push({ ns, dicts })
          return () => {}
        },
        bind: () => (key) => key,
      },
      configForms: {
        get(ns) {
          record.formNamespace = ns
          return scope
        },
        whileServed(namespaces, register) {
          record.whileServed.push(namespaces)
          return register(new Set(namespaces))
        },
      },
      slots: {
        inject(key, callback) {
          record.injected.push(key)
          return callback()
        },
        register(options, component) {
          record.registered.push({ options, component })
          return () => {}
        },
      },
    },
  }
}

/** Mount the plugin over a fresh namespace scope; returns its live face. */
function mountWith(scope) {
  const { ctx, record } = clientCtx(scope)
  exports_.apply(ctx)
  const { options, component } = record.registered[0]
  return { scope, record, component, props: bindInjectSources(options.inject()) }
}

/** Mount over a fresh effective value. */
function mount(value, base) {
  return mountWith(scopeFor(value, base))
}

async function render(value) {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const mounted = mount(value)
  const markup = renderToStaticMarkup(React.createElement(mounted.component, { t: (key) => key, ...mounted.props }))
  return { ...mounted, markup }
}

//#endregion

//#region 2 — registration

const probe = mount({ enabled: true, maxRetries: 5 })

await check('apply() binds the model-retry-settings namespace', () => {
  assert.equal(probe.record.formNamespace, 'model-retry-settings')
})

await check('apply() registers the plugin locale dictionary', () => {
  assert.equal(probe.record.locale.length, 1)
  assert.equal(probe.record.locale[0].ns, 'model-retry-settings')
  assert.ok(probe.record.locale[0].dicts.en && probe.record.locale[0].dicts.zh, 'both dictionaries must be present')
})

await check('apply() gates the card on the namespace being served', () => {
  assert.deepEqual(probe.record.whileServed, [['model-retry-settings']])
})

await check('apply() waits for the Models page footer slot', () => {
  assert.deepEqual(probe.record.injected, ['settings.models.footer'])
})

await check('the registration targets settings.models.footer with a stable id', () => {
  assert.equal(probe.record.registered.length, 1)
  const { options } = probe.record.registered[0]
  assert.equal(options.name, 'settings.models.footer')
  assert.equal(options.id, 'model-retry-settings')
  assert.equal(typeof options.order, 'number')
  assert.equal(options.locale, 'model-retry-settings')
  assert.equal(typeof options.label, 'function')
})

await check('the injected face is the renderer-shaped hook plus the form actions', () => {
  assert.equal(typeof probe.props.useModelRetryCard, 'function', 'hooks.modelRetryCard must become useModelRetryCard')
  for (const action of ['edit', 'resetField', 'save', 'discard']) {
    assert.equal(typeof probe.props[action], 'function', `missing action ${action}`)
  }
})

await check('apply() reports no mount failure', () => {
  assert.deepEqual(probe.record.warned, [])
})

//#endregion

//#region 3 — rendering

await check('the card renders through react-dom/server', async () => {
  const { markup } = await render({ enabled: true, maxRetries: 5 })
  assert.match(markup, /dmrs-card/)
  assert.match(markup, /role="switch"/)
  assert.match(markup, /aria-checked="true"/, 'the switch must show the armed state')
  assert.match(markup, /model-retry-max-retries/)
  assert.match(markup, /value="5"/, 'the field must render the effective value')
})

await check('a disarmed namespace renders the switch off and the field disabled', async () => {
  const { markup } = await render({ enabled: false, maxRetries: 3 })
  assert.match(markup, /aria-checked="false"/)
  assert.match(markup, /disabled/)
})

//#endregion

//#region 4 — field specs

async function save(value, edits) {
  const mounted = mount(value)
  for (const [field, text] of edits) mounted.props.edit(field, text)
  await mounted.props.save()
  return mounted.scope.writes
}

await check('a whole-number draft is staged as a set op', async () => {
  const writes = await save({ enabled: true, maxRetries: 5 }, [['maxRetries', '7']])
  assert.deepEqual(writes, [{ ops: [{ op: 'set', path: ['maxRetries'], value: 7 }], revision: 1 }])
})

await check('0 is accepted (retrying disabled)', async () => {
  const writes = await save({ enabled: true, maxRetries: 5 }, [['maxRetries', '0']])
  assert.deepEqual(writes.at(-1).ops, [{ op: 'set', path: ['maxRetries'], value: 0 }])
})

await check('the upper bound itself is accepted', async () => {
  const writes = await save({ enabled: true, maxRetries: 5 }, [['maxRetries', '50']])
  assert.deepEqual(writes.at(-1).ops, [{ op: 'set', path: ['maxRetries'], value: 50 }])
})

await check('an out-of-range or fractional draft blocks the save', async () => {
  for (const draft of ['abc', '2.5', '51', '-1', '1e999']) {
    const writes = await save({ enabled: true, maxRetries: 5 }, [['maxRetries', draft]])
    assert.deepEqual(writes, [], `draft ${JSON.stringify(draft)} must not reach the Host`)
  }
})

await check('the switch stages a boolean set op', async () => {
  const writes = await save({ enabled: true, maxRetries: 5 }, [['enabled', 'false']])
  assert.deepEqual(writes.at(-1).ops, [{ op: 'set', path: ['enabled'], value: false }])
})

await check('an empty draft clears the field (reset semantics)', async () => {
  // A field only clears when the user layer carries it; simulate that with the
  // user layer recorded on the scope snapshot.
  const scope = scopeFor({ enabled: true, maxRetries: 2 }, { enabled: true, maxRetries: 5 })
  scope.setSnapshot({
    status: 'ready',
    value: { enabled: true, maxRetries: 2 },
    base: { enabled: true, maxRetries: 5 },
    user: { maxRetries: 2 },
    revision: 1,
    writable: true,
    mode: 'host',
  })
  const mounted = mountWith(scope)
  mounted.props.edit('maxRetries', '')
  await mounted.props.save()
  assert.deepEqual(scope.writes.at(-1).ops, [{ op: 'unset', path: ['maxRetries'] }])
})

await check('a draft equal to the effective value is a no-op', async () => {
  const writes = await save({ enabled: true, maxRetries: 5 }, [['maxRetries', '5']])
  assert.deepEqual(writes, [], 'nothing to write when the draft matches the effective value')
})

//#endregion

console.log(results.join('\n'))
const failed = results.filter((line) => line.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
