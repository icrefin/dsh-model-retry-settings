# Verification harness

Two suites, both driven against the **real** dsh SDK rather than a mock: the
`@deepseek-ai/*` packages are taken from the installed `app.asar` at setup time,
and the plugin is reached through a symlink to its own `lib/`, so nothing under
test can drift from what `package.json` exports.

```sh
scripts/verify.sh
```

| File | Role |
|---|---|
| `setup.mjs` | builds `.test-workspace/` (npm collaborators, SDK from the asar or from npm, plugin symlink) |
| `asar.mjs` | minimal `app.asar` reader |
| `dsh-hooks.mjs` | Node module hooks: anchors bare imports at the harness, stubs browser-only collaborators |
| `host.test.mjs` | the Host half (17 checks) |
| `client.test.mjs` | the browser half (20 checks) |

## What the host suite proves

1. the exported `Config` validates, defaults both fields, and marks both
   `.volatile()`; the Loader hands `apply()` **live refs**, not raw values, which
   is why the plugin reads every field through `.get()`;
2. `resolveEffectiveConfig` handles a live ref, a plain value, and an absent
   field, and falls back to the shipped default for an out-of-contract number;
3. `apply()` registers the `agent/request-error` listener with
   `{ prepend: true }`, and — through a **real `cordis` `Context`** — that
   listener really is the outermost holder of the waterfall, so it runs before a
   later-registered retry executor. This is the plugin's load-bearing claim;
4. the listener rewrites `retryPolicy.maxRetries` on the payload the executor
   reads, leaves `always` and absent policies untouched, is a no-op when
   disarmed, never mutates the frozen provider policy, and preserves every other
   policy field;
5. a volatile value changed after `apply()` — the in-place update the Loader's
   `ConfigEditor` performs — is observed on the next failure with no re-`apply`,
   no restart, and no subscription.

## What the client suite proves

1. the bundle registers exactly one factory under the **package name the boot
   graph row carries** (a mismatch makes the module system reject the bundle),
   and injects one `<style>` tag at *materialization* time — left untagged, which
   is what the loader's `claimStyles` expects;
2. `apply()` binds the `model-retry-settings` namespace, registers the locale
   dictionary, gates the card on `configForms.whileServed`, and waits for the
   `settings.models.footer` declaration instead of racing it;
3. the injected face is what the renderer's own contract produces —
   `hooks.modelRetryCard` becomes `props.useModelRetryCard`;
4. the card renders through `react-dom/server` with the real
   `@deepseek-ai/dsh-client-ui-primitives`, showing the effective retry budget
   and the armed/disarmed state;
5. every draft rule of the card's field specs: whole numbers become `set` ops,
   an empty draft on an overridden field becomes `unset`, a draft equal to the
   effective value writes nothing, and an out-of-range or fractional draft
   blocks the save instead of reaching the Host.

## Notes

- The first run needs network access: `ui-primitives` and `client-store` are the
  *node* builds of browser packages, so Node must resolve `react`, `react-dom`,
  `clsx`, `zustand`, `immer`, and `use-sync-external-store` directly.
- A dsh release may inline a client package into the web shell as a *platform
  seed* instead of installing it under the app's `node_modules` — in
  `0.2.1-rc.5` that is true of `dsh-client-ui-primitives`, `dsh-client-ui-slots`,
  and `dsh-client-store`. There is no directory to extract for those, so
  `setup.mjs` pins them to the installation's own version (`/dsh/package.json`)
  and fetches them from npm: the same published artifacts the shell bundle was
  built from.
- `dsh-hooks.mjs` stubs the packages the Vite web build bundles away
  (`shiki`, `katex`, `simple-icons`, the `micromark-*` family, `anser`, `diff`),
  and maps `.module.css` imports to a class-name-echoing object. None of those
  participate in the code under test.
- Set `DSH_ASAR` to read a different installation (for example a Windows or
  unpacked layout).
- `.test-workspace/` is disposable; delete it to force a clean rebuild.
