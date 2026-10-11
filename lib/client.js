/**
 * dsh-model-retry-settings — browser half.
 *
 * Renders one card at the foot of the web client's **Settings → Model** page
 * (`settings.models.footer`) holding the retry preference the Host half
 * enforces: a switch that arms the override, and the retry budget itself.
 *
 * The card is a *reader and writer of the plugin's own settings namespace*,
 * never of the models page's own namespace: `ctx.configForms.get(
 * 'model-retry-settings')` is the same shared form the Host's Loader entry
 * publishes, so a save here is an ordinary fenced document mutation and the
 * Host is the only authority on whether a value was accepted.
 *
 * Registration discipline:
 *
 *  - `settings.models.footer` is declared by the Models settings *entry*
 *    (`@deepseek-ai/dsh-client-ui-settings-models`) as one of its children, so
 *    it only exists while that entry is registered. `ctx.slots.inject` waits
 *    for the declaration instead of racing it, and re-registers if the slot
 *    collapses and returns.
 *  - `ctx.configForms.whileServed` keeps the whole registration off a
 *    deployment that never composed this plugin's Host half: with no
 *    `model-retry-settings` namespace there is nothing to read or write, and a
 *    card that could not save must not appear at all.
 *
 * Failure policy: mounting problems are logged, never thrown — the web shell
 * fails the entire boot when a plugin's `apply` throws, and an external plugin
 * must not be able to take the GUI down.
 *
 * This bundle is hand-authored in the loader's factory form
 * (`window.__ModuleLoader__.load({ id, factory })`) and needs no build step.
 * Module specifiers it requires are either platform seeds (`react`,
 * `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`) or listed in
 * `dsh.client.inject` in package.json.
 */

window.__ModuleLoader__.load({
  id: 'dsh-model-retry-settings',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // Platform seeds: no `dsh.client.external` entry is needed for these.
    const { jsx, jsxs } = require('react/jsx-runtime')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    //#region constants

    /** Settings namespace owned by this plugin: the Host Loader entry id. */
    const ENTRY_ID = 'model-retry-settings'

    /** Locale dictionary namespace owned by this plugin. */
    const NS = 'model-retry-settings'

    /** The Models settings page's ordered extension area for page-wide extras. */
    const FOOTER_SLOT = 'settings.models.footer'

    /** Must equal `MAX_RETRIES_LIMIT` in the Host half; a client half cannot import a Host package. */
    const MAX_RETRIES_LIMIT = 50

    /** The Host schema's default, so a first render shows what is in effect. */
    const DEFAULT_MAX_RETRIES = 5

    //#endregion

    //#region locales

    /** English copy. */
    const en = {
      title: 'Request retries',
      description:
        'How many times a failed model request may be retried before the turn gives up. Applies to every provider in this profile.',
      override: 'Override provider retry policy',
      overrideHint:
        'While on, the value below replaces each provider’s own retry budget. Turn it off to let every provider’s declared policy apply.',
      maxRetries: 'Max retries',
      maxRetriesHint: `Whole number from 0 to ${MAX_RETRIES_LIMIT}. 0 disables retrying; the shipped default is ${DEFAULT_MAX_RETRIES}.`,
      overridden: 'Overridden',
      reset: 'Reset to default',
      invalidNumber: `Enter a whole number between 0 and ${MAX_RETRIES_LIMIT}, or leave blank to use the default.`,
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      readOnly: 'This deployment stores settings read-only.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      inputLabel: 'Max retries value',
    }

    /** Simplified Chinese copy. */
    const zh = {
      title: '请求重试',
      description: '模型请求失败后，本轮最多重试多少次。对本配置中的所有提供方生效。',
      override: '覆盖提供方重试策略',
      overrideHint: '开启后，下方数值会替代各提供方自己的重试次数；关闭则完全沿用提供方声明的策略。',
      maxRetries: '最大重试次数',
      maxRetriesHint: `0 到 ${MAX_RETRIES_LIMIT} 之间的整数。0 表示不重试；随附默认值为 ${DEFAULT_MAX_RETRIES}。`,
      overridden: '已覆盖',
      reset: '恢复默认',
      invalidNumber: `请填写 0 到 ${MAX_RETRIES_LIMIT} 之间的整数；留空表示使用默认值。`,
      unavailable: '该插件当前未加载，暂时无法配置。',
      readOnly: '本部署的设置为只读。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      inputLabel: '最大重试次数',
    }

    /**
     * The form frame's copy, read from this card's dictionary.
     * @param t - the card's locale reader.
     * @returns the labels the shared settings form renders.
     */
    function formLabels(t) {
      return {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
      }
    }

    //#endregion

    //#region styles

    const STYLE_ID = 'dsh-model-retry-settings-style'

    /**
     * Theme-token-only stylesheet for the card. Injected from the factory body
     * so the module system claims the tag for this plugin and removes it with
     * the bundle (an untagged `<style>` is inventoried at materialization).
     */
    const CSS = `
.dmrs-card{display:flex;flex-direction:column;gap:12px;margin-top:16px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.dmrs-head{display:flex;flex-direction:column;gap:4px}
.dmrs-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:1.4}
.dmrs-description{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
.dmrs-fields{display:flex;flex-direction:column;gap:14px}
.dmrs-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.dmrs-rowText{display:flex;flex-direction:column;gap:3px;min-width:0}
.dmrs-rowTitle{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.dmrs-rowHint{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
`

    /** Inject the card stylesheet once per document. */
    function injectStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.append(style)
    }

    //#endregion

    //#region field specs

    /**
     * A whole-number field with its own bounds.
     *
     * The shared `settingsNumberField` accepts any finite number and leaves
     * range and integrality to the Host schema, so a wrong draft fails only
     * after a round trip. This card rejects it in place instead: a draft that
     * is not a whole number inside `[min, max]` is marked invalid and blocks
     * the save, which is the outcome the settings form is built to express.
     *
     * An empty draft clears the field — the same gesture as resetting it.
     *
     * @param field - field name inside the namespace section.
     * @param min - smallest accepted value, inclusive.
     * @param max - largest accepted value, inclusive.
     * @returns the field's conversion spec.
     */
    function wholeNumberField(field, min, max) {
      return {
        field,
        format: (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : ''),
        parse: (text) => {
          const trimmed = text.trim()
          if (trimmed === '') return { kind: 'clear' }
          const parsed = Number(trimmed)
          if (!Number.isInteger(parsed) || parsed < min || parsed > max) return undefined
          return { kind: 'set', value: parsed }
        },
      }
    }

    /**
     * A boolean field rendered by the `Switch` primitive.
     *
     * `SettingsFormModel` stages every edit as text, so the switch speaks the
     * same two words the spec parses and a save stays a single fenced write.
     *
     * @param field - field name inside the namespace section.
     * @returns the field's conversion spec.
     */
    function flagField(field) {
      return {
        field,
        format: (value) => (value === true ? 'true' : 'false'),
        parse: (text) =>
          text === 'true'
            ? { kind: 'set', value: true }
            : text === 'false'
              ? { kind: 'set', value: false }
              : undefined,
      }
    }

    //#endregion

    //#region card

    /**
     * Render the retry card inside the Models page's footer area.
     *
     * @param props - the card's locale reader, form snapshot, and form actions.
     * @returns the card.
     */
    function ModelRetrySettingsCard(props) {
      const { t } = props
      const state = props.useModelRetryCard((snapshot) => snapshot)
      const armed = state.enabled.text === 'true'

      return jsxs('div', {
        className: 'dmrs-card',
        children: [
          jsxs('div', {
            className: 'dmrs-head',
            children: [
              jsx('div', { className: 'dmrs-title', children: t('title') }),
              jsx('div', { className: 'dmrs-description', children: t('description') }),
            ],
          }),
          jsx(primitives.SettingsForm, {
            labels: formLabels(t),
            state,
            onSave: props.save,
            onDiscard: props.discard,
            children: jsxs('div', {
              className: 'dmrs-fields',
              children: [
                jsxs('div', {
                  className: 'dmrs-row',
                  children: [
                    jsxs('div', {
                      className: 'dmrs-rowText',
                      children: [
                        jsx('div', { className: 'dmrs-rowTitle', children: t('override') }),
                        jsx('div', { className: 'dmrs-rowHint', children: t('overrideHint') }),
                      ],
                    }),
                    jsx(primitives.Switch, {
                      checked: armed,
                      disabled: !state.writable,
                      label: t('override'),
                      onChange: (next) => {
                        props.edit('enabled', next ? 'true' : 'false')
                      },
                    }),
                  ],
                }),
                jsx(primitives.SettingsValueField, {
                  id: 'model-retry-max-retries',
                  label: t('maxRetries'),
                  hint: t('maxRetriesHint'),
                  overriddenLabel: t('overridden'),
                  resetLabel: t('reset'),
                  invalidLabel: t('invalidNumber'),
                  numeric: true,
                  disabled: !state.writable || !armed,
                  ...state.maxRetries,
                  onEdit: (text) => {
                    props.edit('maxRetries', text)
                  },
                  onReset: () => {
                    props.resetField('maxRetries')
                  },
                }),
              ],
            }),
          }),
        ],
      })
    }

    //#endregion

    //#region controller

    /** The retry card's staged form over the `model-retry-settings` namespace. */
    class ModelRetryCardController {
      /**
       * @param scope - the bound settings scope for the `model-retry-settings` namespace.
       */
      constructor(scope) {
        this.form = new primitives.SettingsFormModel(scope, [
          flagField('enabled'),
          wholeNumberField('maxRetries', 0, MAX_RETRIES_LIMIT),
        ])
        this.store = this.form.bind(() => this.projection())
      }

      /**
       * Build the card's state from the form's current reads.
       * @returns the snapshot the card reads through its bound selector.
       */
      projection() {
        return {
          ...this.form.shell(),
          enabled: this.form.field('enabled'),
          maxRetries: this.form.field('maxRetries'),
        }
      }

      /**
       * Build the face the slot registration injects.
       * @returns the card's snapshot hook and its form actions.
       */
      inject() {
        return {
          hooks: { modelRetryCard: this.store },
          ...this.form.actions(),
        }
      }

      /** Release accepted-value subscriptions. */
      dispose() {
        this.form.dispose()
      }
    }

    //#endregion

    //#region plugin

    /** Required services (cordis fiber inject), mirroring the official settings pages. */
    const inject = ['slots', 'locale', 'configForms']

    /**
     * Mount the Models-page card while the Host serves its namespace.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      try {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-model-retry-settings: dictionaries')

        const card = new ModelRetryCardController(ctx.configForms.get(ENTRY_ID))
        ctx.effect(() => () => card.dispose(), 'dsh-model-retry-settings: form subscription')

        ctx.effect(
          () =>
            ctx.configForms.whileServed([ENTRY_ID], () =>
              ctx.slots.inject(FOOTER_SLOT, () =>
                ctx.slots.register(
                  {
                    name: FOOTER_SLOT,
                    id: ENTRY_ID,
                    order: 10,
                    label: () => t('title'),
                    locale: NS,
                    inject: () => card.inject(),
                  },
                  ModelRetrySettingsCard,
                ),
              ),
            ),
          'dsh-model-retry-settings: Models page card',
        )
      } catch (error) {
        // An external plugin must never take the web shell down with it.
        ctx.logger?.warn?.('dsh-model-retry-settings: the Models-page card could not mount: %o', error)
      }
    }

    //#endregion

    injectStyles()

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
