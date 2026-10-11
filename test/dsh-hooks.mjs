/**
 * Node module hooks that make the dsh browser bundle
 * `@deepseek-ai/dsh-client-ui-primitives` importable outside a browser.
 *
 * The shipped `lib/index.js` is the *node* build of that package: it imports
 * plain `.module.css` files and a handful of browser-only third-party packages
 * that the Vite web build bundles away. Neither can be loaded by Node as-is,
 * and neither is under test here — the settings-form code inside the same
 * module is what the client test exercises. So this hook:
 *
 *  - resolves every `.css` import to a class-name-echoing stub object, which is
 *    exactly what a CSS-module import yields for the class names the JSX uses;
 *  - resolves the enumerated browser-only packages to generated ESM stubs that
 *    export precisely the names the primitives module imports;
 *  - leaves everything else (react, react-dom, clsx, and the real dsh packages
 *    extracted from the installation) to Node's own resolution.
 */

import { registerHooks } from 'node:module'

/** Every named export the primitives module imports from `simple-icons`. */
const SIMPLE_ICONS = [
  'siAliexpress', 'siApple', 'siBaidu', 'siBilibili', 'siCsdn', 'siDuckduckgo', 'siEbay', 'siFacebook',
  'siGithub', 'siGitlab', 'siGoogle', 'siInstagram', 'siJuejin', 'siMdnwebdocs', 'siNetflix', 'siNpm',
  'siPypi', 'siQq', 'siQuora', 'siReddit', 'siSinaweibo', 'siSpotify', 'siStackoverflow', 'siTaobao',
  'siTelegram', 'siTiktok', 'siV2ex', 'siWechat', 'siWhatsapp', 'siWikipedia', 'siX', 'siYcombinator',
  'siYoutube', 'siZhihu',
]

/**
 * A callable, arbitrarily-indexable stub. Browser-only collaborators are
 * reached both as constructors/factories and as plain namespaces here, so one
 * shape covers both: any property read answers another stub, and any call
 * answers another stub.
 */
const STUB_PRELUDE = `const makeStub = (name) => new Proxy(function () {}, {
  get: (target, key) => {
    if (key === "then") return undefined;
    if (key === "name") return name;
    // Property keys and template interpolation coerce a stub through these.
    if (key === Symbol.toPrimitive) return () => name;
    if (key === "toString" || key === "valueOf") return () => name;
    if (typeof key === "symbol") return makeStub(name);
    return makeStub(name + "." + String(key));
  },
  apply: () => makeStub(name + "()"),
});
`

/** Build `export const a = <stub>; ...` plus an optional stub default. */
function names(list, withDefault = false) {
  return `${STUB_PRELUDE}${list.map((name) => `export const ${name} = makeStub(${JSON.stringify(name)});`).join('\n')}\n${withDefault ? 'export default makeStub("default");\n' : ''}`
}

/** Stub sources keyed by the bare specifier the primitives module imports. */
const STUBS = {
  'simple-icons': names(SIMPLE_ICONS),
  'shiki/core': names(['createCssVariablesTheme', 'createHighlighterCoreSync']),
  'shiki/engine/javascript': names(['createJavaScriptRegexEngine', 'defaultJavaScriptRegexConstructor']),
  '@shikijs/langs/typescript': `${STUB_PRELUDE}export default makeStub("typescript");`,
  '@shikijs/langs/shellscript': `${STUB_PRELUDE}export default makeStub("shellscript");`,
  '@shikijs/langs/json': `${STUB_PRELUDE}export default makeStub("json");`,
  anser: `${STUB_PRELUDE}export default makeStub("Anser");`,
  diff: names(['structuredPatch']),
  katex: `${STUB_PRELUDE}export default makeStub("katex");`,
  'mdast-util-from-markdown': names(['fromMarkdown']),
  'mdast-util-gfm': names(['gfmFromMarkdown']),
  'mdast-util-math': names(['mathFromMarkdown']),
  'micromark-extension-gfm': names(['gfm']),
  'micromark-extension-math': names(['math']),
  'micromark-core-commonmark': names(['attention']),
  'micromark-util-character': names(['markdownLineEnding', 'unicodePunctuation']),
  'micromark-util-classify-character': names(['classifyCharacter']),
  'micromark-util-symbol': names(['codes', 'constants', 'types']),
  'micromark-factory-space': names(['factorySpace']),
  'micromark-util-sanitize-uri': names(['normalizeUri']),
}

/** True for a specifier this hook owns. */
function isStubbed(specifier) {
  return Object.hasOwn(STUBS, specifier)
}

const stubUrl = (specifier) => `dsh-stub:${encodeURIComponent(specifier)}`
const cssUrl = (specifier) => `dsh-css:${encodeURIComponent(specifier)}`

/**
 * Anchor for the fallback below: resolving from the harness manifest puts
 * `.test-workspace/node_modules` on the lookup path for ANY importer, including
 * the plugin's own real path and the extracted dsh packages. Without it, a bare
 * import inside `lib/index.js` would walk up from this package's root — which
 * has no node_modules — and fail.
 */
const HARNESS_ANCHOR = new URL('../.test-workspace/package.json', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.css')) return { url: cssUrl(specifier), shortCircuit: true }
    if (isStubbed(specifier)) return { url: stubUrl(specifier), shortCircuit: true }
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      // Only a bare specifier can be re-anchored; a broken relative path is a
      // real failure and must surface as one.
      const bare = !specifier.startsWith('.') && !specifier.startsWith('file:') && !specifier.startsWith('node:')
      if (!bare) throw error
      return nextResolve(specifier, { ...context, parentURL: HARNESS_ANCHOR })
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('dsh-css:')) {
      const specifier = decodeURIComponent(url.slice('dsh-css:'.length))
      // A CSS-module default export: every property key asked for is a class
      // name in the real build, so echoing the key back is faithful.
      return {
        format: 'module',
        shortCircuit: true,
        source: `const styles = new Proxy({}, { get: (_target, key) => (typeof key === "string" ? key : undefined) });\nexport default styles;\n`,
      }
    }
    if (url.startsWith('dsh-stub:')) {
      const specifier = decodeURIComponent(url.slice('dsh-stub:'.length))
      return { format: 'module', shortCircuit: true, source: STUBS[specifier] }
    }
    return nextLoad(url, context)
  },
})
