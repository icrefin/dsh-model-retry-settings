/**
 * Prepare the verification workspace.
 *
 * The tests exercise this plugin against the REAL dsh SDK — `schemastery`,
 * `cordis`, `ui-primitives`, `ui-slots`, `client-store` — pulled out of the
 * installed `app.asar`, so a passing run says something about the composition
 * this plugin actually ships into rather than about a mock.
 *
 * What this script builds, under `.test-workspace/` (gitignored):
 *
 *   node_modules/{react,react-dom,clsx,zustand,immer,use-sync-external-store}
 *                                 installed from npm: the browser-only
 *                                 collaborators the node build of
 *                                 ui-primitives / client-store still import
 *   node_modules/@deepseek-ai/*   extracted from the installation's asar, or —
 *                                 for the client packages the web shell inlines
 *                                 as platform seeds — installed from npm at the
 *                                 installation's own version
 *   package.json                  `"type": "module"` for the workspace
 *   plugin                        a SYMLINK to this package's own `lib/`
 *
 * The symlink matters: the tests always load the shipped files, so no copy can
 * drift from what `package.json` exports.
 *
 * Order is load-bearing: npm prunes every directory it does not own, so the npm
 * install runs first and the asar extraction last.
 *
 * Environment:
 *   DSH_ASAR   override the archive to read (default: the macOS installation)
 *
 * Usage: `node test/setup.mjs`
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openAsar, DEFAULT_ASAR } from './asar.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(here, '..')
const workspace = path.join(packageRoot, '.test-workspace')
const modules = path.join(workspace, 'node_modules')
const npmCache = path.join(workspace, '.npm-cache')

/** dsh packages the two test suites import directly or transitively. */
const DSH_PACKAGES = [
  'schemastery',
  'cordis',
  'cosmokit',
  'dsh-client-store',
  'dsh-client-ui-slots',
  'dsh-client-ui-primitives',
  'dsh-util-workspace-path',
  'dsh-util-code-language',
]

/** The npm packages the node build of ui-primitives / client-store expects to resolve. */
const NPM_PACKAGES = [
  'react@18.3.1',
  'react-dom@18.3.1',
  'clsx@2',
  'zustand@4.4.7',
  'immer@10',
  'use-sync-external-store@1.2.2',
]

/** The bare package name of an `name@range` spec. */
function packageNameOf(spec) {
  const at = spec.lastIndexOf('@')
  return at <= 0 ? spec : spec.slice(0, at)
}

fs.mkdirSync(modules, { recursive: true })
fs.mkdirSync(npmCache, { recursive: true })

const manifest = path.join(workspace, 'package.json')
if (!fs.existsSync(manifest)) {
  fs.writeFileSync(
    manifest,
    `${JSON.stringify({ name: 'dsh-model-retry-settings-tests', private: true, type: 'module' }, null, 2)}\n`,
  )
}

//#region 1 — the plugin under test, by symlink

const plugin = path.join(workspace, 'plugin')
fs.rmSync(plugin, { recursive: true, force: true })
fs.mkdirSync(plugin, { recursive: true })
fs.symlinkSync(path.join(packageRoot, 'lib'), path.join(plugin, 'lib'), 'dir')
console.log("setup: plugin/lib -> this package's own lib/ (symlink, so no copy can drift)")

//#endregion

//#region 2 — the browser-only collaborators, from npm (prunes node_modules)
//
// The dsh web shell inlines a few client packages as *platform seeds* instead of
// installing them under `node_modules`: `ui-primitives`, `ui-slots`, and
// `client-store` are bundled into `@deepseek-ai/dsh-web-frontend`'s dist. The
// installation therefore has no directory to extract for them, and the published
// packages — the same artifacts the bundle was built from — are pinned to this
// installation's own version and fetched alongside the collaborators.

const asar = openAsar(process.env.DSH_ASAR ?? DEFAULT_ASAR)

/**
 * The dsh release this installation carries.
 *
 * Every `@deepseek-ai/dsh-*` package ships in lockstep, so the installation's
 * own manifest states the release for all of them.
 */
const sdkVersion = JSON.parse(asar.readFile('/dsh/package.json').toString('utf8')).version

/** Archive path of one dsh SDK package's directory. */
const asarPrefix = (name) => `/dsh/node_modules/@deepseek-ai/${name}/`

/** shipped: dsh SDK packages this installation still installs as their own directory. */
const shipped = DSH_PACKAGES.filter((name) =>
  asar.entries.some((entry) => entry.path.startsWith(asarPrefix(name))),
)
/** fetched: dsh SDK packages the web shell bundles instead. */
const fetched = DSH_PACKAGES.filter((name) => !shipped.includes(name))
if (fetched.length > 0) {
  console.log(`setup: not installed by this dsh build, fetching from npm@${sdkVersion}: ${fetched.join(' ')}`)
}
for (const name of fetched) NPM_PACKAGES.push(`@deepseek-ai/${name}@${sdkVersion}`)

/**
 * A directory whose manifest names a different version than the spec asks for is
 * stale, not present. Without this, a workspace prepared for an older dsh keeps
 * its old packages — and the SDK the tests exercise would not be the installed one.
 */
const stale = NPM_PACKAGES.filter((spec) => {
  const name = packageNameOf(spec)
  const wanted = spec.slice(spec.lastIndexOf('@') + 1)
  if (!/^\d+\.\d+\.\d+/.test(wanted)) return false
  const file = path.join(modules, name, 'package.json')
  if (!fs.existsSync(file)) return false
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).version !== wanted
  } catch {
    return true
  }
})
for (const name of stale.map(packageNameOf)) {
  console.log(`setup: removing stale ${name}`)
  fs.rmSync(path.join(modules, name), { recursive: true, force: true })
}

const missing = NPM_PACKAGES.filter((spec) => !fs.existsSync(path.join(modules, packageNameOf(spec), 'package.json')))
if (missing.length > 0) {
  console.log(`setup: npm install ${missing.join(' ')}`)
  const result = spawnSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--no-save', '--cache', npmCache, `--prefix=${workspace}`, ...NPM_PACKAGES],
    { stdio: 'inherit', cwd: workspace },
  )
  if (result.status !== 0) {
    console.error('setup: npm install failed — the harness needs network access on its first run')
    process.exit(result.status ?? 1)
  }
} else {
  console.log('setup: npm collaborators already present')
}

//#endregion

//#region 3 — the real dsh SDK, out of the installation

console.log(`setup: reading ${asar.archive}`)
for (const name of shipped) {
  const destination = path.join(modules, '@deepseek-ai', name)
  fs.rmSync(destination, { recursive: true, force: true })
  const written = asar.extract(asarPrefix(name), destination)
  console.log(`setup:   @deepseek-ai/${name} (${written} files)`)
}
asar.close()

//#endregion

console.log(`setup: ready in ${path.relative(process.cwd(), workspace)}`)
