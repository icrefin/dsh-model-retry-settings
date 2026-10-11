/**
 * Render the shipped client bundle outside the GUI and screenshot it.
 *
 * The browser half's slot wiring is verified against the live app by
 * `scripts/verify.sh`, which loads the bundle through the real
 * `@deepseek-ai/*` packages; this harness answers the other half — that the
 * component tree and the card's own stylesheet actually paint, and how the card
 * sits on the **Settings → Model** page. It loads `lib/client.js` through a stub
 * `window.__ModuleLoader__`, calls the plugin's `apply()` with a minimal fake
 * client context whose `slots.register` only records the entry, replays a
 * plausible settings document through that fake context, and mounts the
 * `settings.models.footer` entry under a hand-drawn Models page.
 *
 * Nothing here touches a real profile, a real settings document, or the
 * network. The page around the card — the heading, the two provider rows and
 * the add control — belongs to this harness; the card itself is the shipped
 * bundle, rendering the plugin's own copy through the same inject face the
 * renderer builds. The shared settings-form primitives are stood in for,
 * because the node build of `@deepseek-ai/dsh-client-ui-primitives` cannot run
 * in a browser page (CSS-module imports, shiki, simple-icons); the stand-in
 * mirrors the primitives' markup, class semantics and stylesheet, and is the
 * only part of the picture that is not shipped code.
 *
 * Usage:
 *
 *     node tools/preview.mjs [--out <dir>] [--png <file>] [--open]
 *
 * It needs Google Chrome on the host and React's UMD builds, which
 * `node test/setup.mjs` (run by `sh scripts/verify.sh`) puts in
 * `.test-workspace/node_modules`. The default `--png` is the committed README
 * screenshot, `docs/images/settings-model-retries.png`.
 *
 * @module dsh-model-retry-settings/tools/preview
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const bundle = join(packageRoot, 'lib', 'client.js')

/** Chrome binaries to try, in order. */
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

/** Directories that may hold React's UMD builds, in order. */
const REACT_ROOTS = [join(packageRoot, 'node_modules'), join(packageRoot, '.test-workspace', 'node_modules')]

/** The Settings → Model rows the fake host face serves, above the plugin's card. */
const PROVIDERS = [
  { name: 'DeepSeek Account', tag: null, configured: true },
  { name: 'OpenAI', tag: 'Custom', configured: true },
]

/** The page copy the Models settings page itself renders. */
const PAGE = {
  title: 'Models',
  intro: 'Enter your API keys to use models from the following providers.',
  add: 'Add model provider',
  edit: 'Edit',
  delete: 'Delete',
  credentialConfigured: 'API key configured',
}

/**
 * The `model-retry-settings` namespace as a fresh install serves it: both
 * fields in the composition layer, no user layer, so nothing is overridden.
 */
const SETTINGS = { enabled: true, maxRetries: 5 }

/**
 * The page's stylesheet: the light-mode theme tokens this preview paints with
 * (copied from the shipped theme), the Models page frame, and the
 * settings-form chrome the primitives normally contribute.
 */
const STYLE = `
:root{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-3:#fff;
--dsw-alias-bg-module-platform:#f5f6f7;--dsw-alias-border-l1:#0000000a;--dsw-alias-border-l2:#0000001a;
--dsw-alias-border-l3:#0000001f;--dsw-alias-border-l4:#00000029;--dsw-alias-brand-primary:#0f1115;
--dsw-alias-button-primary-fill:#0f1115;--dsw-alias-label-primary:#0f1115;
--dsw-alias-label-primary-foreground:#fff;--dsw-alias-label-secondary:#61666b;
--dsw-alias-label-tertiary:#81858c;--dsw-alias-label-error:#ec1313;--dsw-alias-state-error-primary:#ec1313;
--dsw-alias-state-success-primary:#22c55e;--dsw-alias-state-business-primary:#4176e6;
--dsw-alias-switch-thumb:#fff;--dsw-alias-settings-card-fill:#f9fafb;--dsw-alias-settings-card-stroke:#0000000a;
--dsw-radius-xs:4px;--dsw-radius-sm:8px;--dsw-radius-md:12px;--dsw-radius-lg:16px;--dsw-radius-xl:20px;
--dsw-focus-ring-width:2px;--dsw-focus-ring-color:transparent}
html,body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
-webkit-font-smoothing:antialiased}
.page{max-width:760px;margin:0 auto;padding:48px 32px 64px}
.pageHead{display:flex;flex-direction:column;gap:8px;margin:0 0 20px}
.pageTitle{margin:0;font-size:20px;font-weight:500;line-height:28px}
.pageIntro{margin:0;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px}
.rows{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.rowCard{border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);
border-radius:var(--dsw-radius-xl);display:flex;flex-direction:column;gap:12px;padding:12px 14px}
.rowHead{display:flex;align-items:center;gap:10px}
.rowIdentity{display:inline-flex;align-items:center;gap:6px;min-width:0}
.rowName{font-size:14px;font-weight:500;line-height:22px}
.rowTag{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-xs);
color:var(--dsw-alias-label-secondary);padding:1px 6px;font-size:11px;line-height:16px}
.credentialDot{box-sizing:border-box;border-radius:50%;width:8px;height:8px;display:inline-block}
.credentialDotConfigured{background:var(--dsw-alias-state-success-primary)}
.rowActions{display:inline-flex;align-items:center;gap:4px;margin-left:auto}
.secondaryButton{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);
height:28px;padding:0 10px;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;
line-height:18px;cursor:pointer}
.addActions{display:flex;margin-top:12px}
.addButton{box-sizing:border-box;flex:1 1 0;min-width:180px;height:44px;border:1px dashed var(--dsw-alias-border-l3);
border-radius:var(--dsw-radius-lg);background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;
line-height:22px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.addGlyph{font-size:15px;line-height:22px;color:var(--dsw-alias-label-secondary)}
.footerSlot{margin-top:0}
.dsw-form{display:flex;flex-direction:column}
.dsw-readOnly,.dsw-unavailable{margin:0 0 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsw-footer{display:flex;align-items:center;gap:8px;padding-top:16px}
.dsw-failed{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
.dsw-save{appearance:none;border:1px solid transparent;border-radius:var(--dsw-radius-md);padding:5px 14px;
font:inherit;font-size:13px;line-height:1.5;cursor:pointer;background:var(--dsw-alias-label-primary);
color:var(--dsw-alias-bg-layer-3)}
.dsw-save:disabled{opacity:.4;cursor:default}
.dsw-save:focus-visible{outline:var(--dsw-focus-ring-width) solid
var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsw-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.dsw-field + .dsw-field{border-top:.5px solid var(--dsw-alias-border-l2)}
.dsw-fieldHead{display:flex;align-items:center;gap:8px}
.dsw-fieldLabel{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.dsw-badges{display:inline-flex;align-items:center;gap:8px}
.dsw-tag{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-xs);
color:var(--dsw-alias-label-secondary);padding:1px 6px;font-size:11px;line-height:16px}
.dsw-reset{border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;
color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsw-input{height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);
background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.dsw-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.dsw-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dsw-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsw-invalid{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}
.dsw-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;
border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}
.dsw-switch[aria-checked='true']{background:var(--dsw-alias-brand-primary)}
.dsw-switch:disabled{cursor:default;opacity:.5}
.dsw-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);
transition:transform 120ms ease}
.dsw-switch[aria-checked='false'] .dsw-thumb{background:var(--dsw-alias-switch-thumb)}
.dsw-switch[aria-checked='true'] .dsw-thumb{transform:translateX(16px)}
`

/**
 * The harness page: React, the bundle, then the stand-in primitives, the fake
 * client context, and the mount. The inlined script uses no template literals
 * so the page can stay one template literal here.
 *
 * @param reactSource - React's UMD build.
 * @param reactDomSource - ReactDOM's UMD build.
 * @param bundleSource - the shipped `lib/client.js`.
 * @returns the page's HTML.
 */
function page(reactSource, reactDomSource, bundleSource) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>dsh-model-retry-settings preview</title>
<style>${STYLE}</style></head>
<body><div id="root"></div>
<script>${reactSource}</script>
<script>${reactDomSource}</script>
<script>
window.__ModuleLoader__ = { load: function (definition) { window.__definition = definition } }
</script>
<script>${bundleSource}</script>
<script>
(function () {
  var root = document.getElementById('root')
  var fail = function (error) {
    var message = error && error.message ? error.message : String(error)
    document.body.dataset.harnessError = message
    root.textContent = 'preview failed: ' + message
    throw error
  }

  //#region the settings-form primitives, stood in for
  // Mirrors the markup, class semantics and stylesheet of
  // @deepseek-ai/dsh-client-ui-primitives, which cannot run in a browser page.

  function createStore(initial) {
    var snapshot = initial
    var listeners = new Set()
    return {
      getSnapshot: function () { return snapshot },
      set: function (next) { snapshot = next; listeners.forEach(function (listener) { listener() }) },
      subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener) } },
    }
  }

  function Switch(props) {
    return React.createElement('button', {
      type: 'button', role: 'switch', 'aria-checked': props.checked, 'aria-label': props.label,
      title: props.title, disabled: props.disabled === true,
      className: 'dsw-switch' + (props.className ? ' ' + props.className : ''),
      onClick: function () { props.onChange(!props.checked) },
    }, React.createElement('span', { className: 'dsw-thumb' }))
  }

  function SettingsValueField(props) {
    var messageId = props.id + '-message'
    var hasMessage = props.invalid || Boolean(props.hint)
    var children = [
      React.createElement('div', { className: 'dsw-fieldHead', key: 'head' },
        React.createElement('label', { className: 'dsw-fieldLabel', htmlFor: props.id }, props.label),
        props.overridden
          ? React.createElement('span', { className: 'dsw-badges' },
              React.createElement('span', { className: 'dsw-tag' }, props.overriddenLabel),
              React.createElement('button', {
                type: 'button', className: 'dsw-reset', disabled: props.disabled, onClick: props.onReset,
              }, props.resetLabel))
          : null),
      React.createElement('input', {
        key: 'input', id: props.id, className: 'dsw-input', type: 'text',
        inputMode: props.numeric === true ? 'numeric' : undefined,
        'aria-invalid': props.invalid ? true : undefined,
        'aria-describedby': hasMessage ? messageId : undefined,
        value: props.text, placeholder: props.placeholder || '', disabled: props.disabled,
        onChange: function (event) { props.onEdit(event.target.value) },
      }),
    ]
    if (hasMessage) {
      children.push(React.createElement('p', {
        key: 'message', id: messageId, className: props.invalid ? 'dsw-invalid' : 'dsw-hint',
      }, props.invalid ? props.invalidLabel : props.hint))
    }
    return React.createElement('div', { className: 'dsw-field' }, children)
  }

  function SettingsForm(props) {
    if (!props.state.available) {
      return React.createElement('p', { className: 'dsw-unavailable', role: 'status' }, props.labels.unavailable)
    }
    var blocked = !props.state.dirty || props.state.invalid || props.state.saving
    return React.createElement('div', { className: 'dsw-form' }, [
      props.state.writable
        ? null
        : React.createElement('p', { className: 'dsw-readOnly', role: 'status', key: 'ro' }, props.labels.readOnly),
      props.children,
      React.createElement('div', { className: 'dsw-footer', key: 'footer' }, [
        props.state.failed
          ? React.createElement('p', { className: 'dsw-failed', role: 'status', key: 'f' }, props.labels.saveFailed)
          : null,
        React.createElement('button', {
          type: 'button', className: 'dsw-save', disabled: blocked, onClick: props.onSave, key: 'save',
        }, props.state.saving ? props.labels.saving : props.labels.save),
      ]),
    ])
  }

  /** The staged-form contract the card drives; same reads, same write plan. */
  function SettingsFormModel(scope, specs) {
    this.scope = scope
    this.specs = new Map(specs.map(function (spec) { return [spec.field, spec] }))
    this.staged = new Map()
    this.listeners = new Set()
    var self = this
    this.unsubscribe = scope.subscribe(function () { self.publish() })
  }
  SettingsFormModel.prototype.snapshot = function () { return this.scope.getSnapshot() }
  SettingsFormModel.prototype.spec = function (field) { return this.specs.get(field) }
  SettingsFormModel.prototype.value = function (field) { return (this.snapshot().value || {})[field] }
  SettingsFormModel.prototype.stored = function (field) {
    var user = this.snapshot().user
    return user !== undefined && Object.prototype.hasOwnProperty.call(user, field)
  }
  SettingsFormModel.prototype.bind = function (project) {
    var store = createStore(project())
    this.listeners.add(function () { store.set(project()) })
    return store
  }
  SettingsFormModel.prototype.field = function (field) {
    var spec = this.spec(field)
    var staged = this.staged.get(field)
    if (staged === undefined) {
      return { text: spec.format(this.value(field)), overridden: this.stored(field), invalid: false }
    }
    var write = staged.clear ? { kind: 'clear' } : spec.parse(staged.text)
    return { text: staged.text, overridden: write && write.kind === 'set', invalid: write === undefined }
  }
  SettingsFormModel.prototype.shell = function () {
    var plan = this.plan()
    return {
      available: this.snapshot().status === 'ready', writable: this.snapshot().writable,
      dirty: plan.length > 0, invalid: plan.some(function (item) { return item.op === undefined }),
      saving: false, failed: false,
    }
  }
  SettingsFormModel.prototype.actions = function () {
    var self = this
    return {
      edit: function (field, text) { self.stage(field, { text: text, clear: false }) },
      resetField: function (field) {
        self.stage(field, { text: self.spec(field).format((self.snapshot().base || {})[field]), clear: true })
      },
      save: function () { return self.save() },
      discard: function () { self.staged.clear(); self.publish() },
    }
  }
  SettingsFormModel.prototype.save = function () {
    var self = this
    var ops = this.plan().map(function (item) { return item.op }).filter(Boolean)
    if (!ops.length) return Promise.resolve()
    return Promise.resolve(this.scope.mutate(ops, this.snapshot().revision)).then(function (landed) {
      if (landed) self.staged.clear()
      self.publish()
    })
  }
  SettingsFormModel.prototype.dispose = function () { this.unsubscribe(); this.listeners.clear() }
  SettingsFormModel.prototype.plan = function () {
    var self = this
    var plan = []
    this.staged.forEach(function (staged, field) {
      var spec = self.spec(field)
      if (staged.clear) {
        if (self.stored(field)) plan.push({ field: field, op: { op: 'unset', path: [field] } })
        return
      }
      if (staged.text === spec.format(self.value(field))) return
      var write = spec.parse(staged.text)
      if (write === undefined) plan.push({ field: field })
      else if (write.kind === 'clear') plan.push({ field: field, op: { op: 'unset', path: [field] } })
      else plan.push({ field: field, op: { op: 'set', path: [field], value: write.value } })
    })
    return plan
  }
  SettingsFormModel.prototype.stage = function (field, edit) { this.staged.set(field, edit); this.publish() }
  SettingsFormModel.prototype.publish = function () {
    this.listeners.forEach(function (listener) { listener() })
  }

  var primitives = {
    SettingsForm: SettingsForm,
    SettingsValueField: SettingsValueField,
    SettingsFormModel: SettingsFormModel,
    Switch: Switch,
  }

  //#endregion

  //#region the loader contract and the fake client context

  var definition = window.__definition
  if (!definition) fail(new Error('lib/client.js registered no factory'))
  if (definition.id !== 'dsh-model-retry-settings') fail(new Error('unexpected factory id: ' + definition.id))

  var jsxRuntime = {
    Fragment: React.Fragment,
    jsx: function (type, props) { return React.createElement(type, props || {}) },
    jsxs: function (type, props) { return React.createElement(type, props || {}) },
  }
  var pluginExports = definition.factory(function (spec) {
    if (spec === 'react') return React
    if (spec === 'react/jsx-runtime') return jsxRuntime
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error('the bundle required an undeclared module: ' + spec)
  })

  /** The settings document the fake host serves for the plugin's namespace. */
  function makeScope(value) {
    var snapshot = {
      status: 'ready', value: value, base: value, user: undefined, revision: 1, writable: true, mode: 'host',
    }
    var listeners = new Set()
    return {
      writes: [],
      getSnapshot: function () { return snapshot },
      subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener) } },
      mutate: function (ops, revision) {
        this.writes.push({ ops: ops, revision: revision })
        snapshot.revision = snapshot.revision + 1
        return true
      },
    }
  }

  var record = { registered: [], injected: [], namespaces: [], dictionaries: [], warned: [] }
  var scope = makeScope(${JSON.stringify(SETTINGS)})
  var ctx = {
    logger: { warn: function () { record.warned.push(Array.prototype.join.call(arguments, ' ')) } },
    effect: function (fn) { var disposer = fn(); return typeof disposer === 'function' ? disposer : function () {} },
    locale: {
      register: function (ns, dictionaries) { record.namespaces.push(ns); record.dictionaries.push(dictionaries.en); return function () {} },
      bind: function (ns) { record.namespaces.push(ns); return function (key) { return key } },
    },
    configForms: {
      get: function (ns) { record.namespaces.push(ns); return scope },
      whileServed: function (namespaces, register) { return register(new Set(namespaces)) },
    },
    slots: {
      inject: function (name, callback) { record.injected.push(name); return callback() },
      register: function (options, component) { record.registered.push({ options: options, component: component }); return function () {} },
    },
  }

  pluginExports.apply(ctx)
  if (record.warned.length > 0) fail(new Error('apply() logged: ' + record.warned.join(' | ')))
  if (record.registered.length !== 1) fail(new Error('expected one slot registration, got ' + record.registered.length))
  var entry = record.registered[0]
  if (entry.options.name !== 'settings.models.footer') fail(new Error('registered into ' + entry.options.name))
  if (entry.options.id !== 'model-retry-settings') fail(new Error('registration id is ' + entry.options.id))

  /** The renderer's own inject binding: hooks.<name> becomes props.use<Name>. */
  function bindInjectSources(face) {
    var sources = face.hooks || {}
    var rest = {}
    Object.keys(face).forEach(function (key) { if (key !== 'hooks' && key !== 'keyedHooks') rest[key] = face[key] })
    Object.keys(sources).forEach(function (name) {
      var source = sources[name]
      rest['use' + name.charAt(0).toUpperCase() + name.slice(1)] = function (selector) {
        var snapshot = React.useSyncExternalStore(
          function (listener) { return source.subscribe(listener) },
          function () { return source.getSnapshot() },
          function () { return source.getSnapshot() },
        )
        return selector ? selector(snapshot) : snapshot
      }
    })
    return rest
  }

  var t = function (key) {
    var dictionary = record.dictionaries[0] || {}
    return dictionary[key] === undefined ? key : dictionary[key]
  }
  var cardProps = Object.assign({ t: t }, bindInjectSources(entry.options.inject()))

  //#endregion

  //#region the page the card sits on

  function providerRow(provider) {
    var identity = [React.createElement('span', { className: 'rowName', key: 'name' }, provider.name)]
    if (provider.tag) identity.push(React.createElement('span', { className: 'rowTag', key: 'tag' }, provider.tag))
    if (provider.configured) {
      identity.push(React.createElement('span', {
        className: 'credentialDot credentialDotConfigured', role: 'img',
        'aria-label': ${JSON.stringify(PAGE.credentialConfigured)}, title: ${JSON.stringify(PAGE.credentialConfigured)}, key: 'dot',
      }))
    }
    return React.createElement('li', { className: 'rowCard', key: provider.name },
      React.createElement('div', { className: 'rowHead' },
        React.createElement('span', { className: 'rowIdentity' }, identity),
        React.createElement('span', { className: 'rowActions' },
          React.createElement('button', { type: 'button', className: 'secondaryButton' }, ${JSON.stringify(PAGE.edit)}),
          React.createElement('button', { type: 'button', className: 'secondaryButton' }, ${JSON.stringify(PAGE.delete)}))))
  }

  ReactDOM.createRoot(root).render(
    React.createElement('div', { className: 'page' }, [
      React.createElement('header', { className: 'pageHead', key: 'head' },
        React.createElement('h1', { className: 'pageTitle' }, ${JSON.stringify(PAGE.title)}),
        React.createElement('p', { className: 'pageIntro' }, ${JSON.stringify(PAGE.intro)})),
      React.createElement('ul', { className: 'rows', key: 'rows' }, ${JSON.stringify(PROVIDERS)}.map(providerRow)),
      React.createElement('div', { className: 'addActions', key: 'add' },
        React.createElement('button', { type: 'button', className: 'addButton' },
          React.createElement('span', { className: 'addGlyph' }, '+'), ${JSON.stringify(PAGE.add)})),
      React.createElement('div', { className: 'footerSlot', key: 'footer' },
        React.createElement(entry.component, cardProps)),
    ]),
  )

  //#endregion

  window.__ready = true
})()
</script>
</body></html>`
}

/**
 * Run one headless Chrome pass and return its stdout.
 *
 * The run gets its own throwaway profile directory: headless Chrome refuses to
 * start without one when a desktop Chrome is already running, and a scratch
 * profile keeps the render independent of the browser on the host.
 *
 * @param chromePath - the Chrome binary.
 * @param args - extra Chrome arguments.
 * @param profile - the throwaway user-data directory.
 * @param url - the page URL.
 * @returns Chrome's stdout.
 */
function runChrome(chromePath, args, profile, url) {
  mkdirSync(profile, { recursive: true })
  return execFileSync(
    chromePath,
    // `--no-sandbox` because the render runs inside this session's file sandbox,
    // where Chrome's own sandbox cannot initialize. `--disable-logging` keeps
    // Chrome's updater/crashpad chatter out of the captured output.
    [...args, '--no-sandbox', '--disable-dev-shm-usage', '--disable-logging', '--log-level=3',
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', url],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
}

/** The flags this harness accepts. */
const argv = process.argv.slice(2)
/**
 * Read a flag's value.
 * @param name - the flag.
 * @param fallback - the value to use when the flag is absent.
 * @returns the value.
 */
const flag = (name, fallback) => {
  const index = argv.indexOf(name)
  return index === -1 ? fallback : argv[index + 1]
}

if (!existsSync(bundle)) {
  console.error(`lib/client.js is missing at ${bundle} — this package ships it, so the checkout is incomplete.`)
  process.exit(1)
}

const bundleSource = readFileSync(bundle, 'utf8')
// The card is what this harness exists to look at; a bundle without its
// stylesheet would render an unstyled block and still screenshot cleanly.
if (!bundleSource.includes('.dmrs-card')) {
  console.error('lib/client.js carries no .dmrs-card stylesheet — is this the shipped bundle?')
  process.exit(1)
}

const modules = REACT_ROOTS.find((candidate) =>
  existsSync(join(candidate, 'react', 'umd', 'react.development.js')))
if (modules === undefined) {
  console.error(
    'React\'s UMD builds were not found. Run `node test/setup.mjs` (or `sh scripts/verify.sh`) first; looked in:\n  ' +
      REACT_ROOTS.map((candidate) => join(candidate, 'react', 'umd')).join('\n  '),
  )
  process.exit(1)
}

const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
if (chromePath === undefined) {
  console.error('No Chrome-family browser found; looked at:\n  ' + CHROME_CANDIDATES.join('\n  '))
  process.exit(1)
}

const outDir = resolve(flag('--out', join(tmpdir(), 'dsh-model-retry-settings-preview')))
const png = resolve(flag('--png', join(packageRoot, 'docs', 'images', 'settings-model-retries.png')))
mkdirSync(outDir, { recursive: true })
mkdirSync(dirname(png), { recursive: true })

const file = join(outDir, 'index.html')
const profile = join(outDir, 'chrome-profile')
writeFileSync(file, page(
  readFileSync(join(modules, 'react', 'umd', 'react.development.js'), 'utf8'),
  readFileSync(join(modules, 'react-dom', 'umd', 'react-dom.development.js'), 'utf8'),
  bundleSource,
))

// The render is verified before it is photographed: the dumped DOM has to carry
// the card, the armed switch, the field and the bundle's stylesheet.
const dom = runChrome(chromePath, [
  '--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom',
], profile, `file://${file}`)

/** Assert the rendered DOM carries one thing. */
const expect = (needle, what) => {
  if (!dom.includes(needle)) {
    const reported = /data-harness-error="([^"]*)"/.exec(dom)
    console.error(`the preview did not render ${what} (looked for ${needle})`)
    if (reported !== null) console.error(`the page reported: ${reported[1]}`)
    else console.error(`the rendered DOM is in ${file}`)
    process.exit(1)
  }
}
expect('dsh-model-retry-settings-style', "the bundle's stylesheet")
expect('dmrs-card', "the plugin's card")
expect('role="switch"', 'the override switch')
expect('aria-checked="true"', 'the armed switch')
expect('id="model-retry-max-retries"', 'the max-retries field')
expect('Request retries', "the card's own title copy")

runChrome(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=1440,700', '--virtual-time-budget=8000', `--screenshot=${png}`,
], profile, `file://${file}`)

console.log(`preview html: ${file}`)
console.log(`screenshot:   ${png}`)
console.log(`rendered:     the Models page with ${PROVIDERS.length} provider rows and the plugin's Request retries card`)
if (argv.includes('--open')) execFileSync('open', [png])
