#!/bin/sh
# Verify dsh-model-retry-settings against the installed dsh SDK.
#
#   1. build the harness workspace (real @deepseek-ai packages out of app.asar)
#   2. run the host-half suite: schema, config resolution, waterfall override
#   3. run the browser-half suite through the module loader's own factory form
#
# The `test/dsh-hooks.mjs` module hooks do two jobs: they anchor bare imports at
# the harness workspace, and they stub the browser-only collaborators the node
# build of ui-primitives imports.
#
# Needs network access on the first run (the npm collaborators). Everything
# after that is offline.
set -e
cd "$(dirname -- "$0")/.."

node test/setup.mjs
echo
node --import ./test/dsh-hooks.mjs test/host.test.mjs
echo
node --import ./test/dsh-hooks.mjs test/client.test.mjs
echo
echo "verify: all suites passed"
