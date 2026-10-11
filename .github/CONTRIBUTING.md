# Contributing to icrefin/dsh-model-retry-settings

Thanks for taking the time to contribute. This document covers the repository
**dsh-model-retry-settings** owned by `icrefin`.

## Ways to contribute

- Report a bug using the *Bug report* issue form.
- Request a feature using the *Feature request* issue form.
- Improve documentation, examples, or translations.
- Send a pull request that fixes or implements something on the issue tracker.

If you plan a large change, open an issue first so we can agree on the design
before you write the implementation.

## Before you start

1. Search existing issues and pull requests to avoid duplicates.
2. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
3. Check the README for supported versions and prerequisites.

## Development setup

There is **no build step**: `lib/index.js` (host half) and `lib/client.js`
(browser half) are hand-authored in the forms dsh loads them in, and they are the
shipped bundle. Clone the repository and you already have the package.

Node `^22.19.0 || >=24.0.0` is what `package.json` declares (`engines`); the
verification harness is run on the Node 22 line.

```bash
git clone https://github.com/icrefin/dsh-model-retry-settings.git
cd dsh-model-retry-settings
sh scripts/verify.sh
```

### The verification story

`sh scripts/verify.sh` is this repository's gate, and it runs against the **real** dsh
SDK rather than a mock: `test/setup.mjs` extracts the `@deepseek-ai/*` packages
out of the installed desktop app's `app.asar`, installs their browser-only npm
collaborators, and symlinks the package's own `lib/` into `.test-workspace/` so
nothing under test can drift from what `package.json` exports. It therefore needs
the DeepSeek Harness desktop app present (set `DSH_ASAR` for a non-default
location) and network access on its first run — which is also why the repository
ships no CI workflow: a hosted runner has no installed app to read.

| Command | What it does |
| --- | --- |
| `sh scripts/verify.sh` | `node test/setup.mjs`, then the two suites below — 37 checks in total |
| `node --import ./test/dsh-hooks.mjs test/host.test.mjs` | the host half, 17 checks |
| `node --import ./test/dsh-hooks.mjs test/client.test.mjs` | the browser half, 20 checks |
| `sh scripts/install.sh` | pack the plugin into `dist/` and print the install path |
| `sh scripts/dev-profile.sh boot` | boot the plugin in an isolated profile on `:19499` (writes only under `.dev-home/`) |
| `node tools/preview.mjs` | render `lib/client.js` outside the GUI and screenshot the card |

**Host half — 17 checks.** The exported `Config` validates, defaults both fields
and marks both `.volatile()`; the Loader hands `apply()` live refs, which is why
every field is read through `.get()`. `resolveEffectiveConfig` handles a live ref,
a plain value and an absent field, and falls back to the shipped default for an
out-of-contract number. `apply()` registers the `agent/request-error` listener
with `{ prepend: true }`, and — through a real `cordis` `Context` — that listener
really is the outermost holder of the waterfall, so it runs before a
later-registered retry executor; the test below drives that without stubbing the
handler bodies. The listener rewrites `retryPolicy.maxRetries` on the payload the
executor reads, leaves `always` and absent policies untouched, is a no-op when
disarmed, never mutates the frozen provider policy, and preserves every other
policy field. A volatile value changed after `apply()` — the in-place update the
Loader's `ConfigEditor` performs — is observed on the next failure with no
re-`apply`, no restart and no subscription.

**Browser half — 20 checks.** The bundle registers exactly one factory under the
package name the boot graph row carries, and injects one `<style>` tag at
materialization time, left untagged for the loader's `claimStyles`. `apply()`
binds the `model-retry-settings` namespace, registers the locale dictionary, gates
the card on `configForms.whileServed`, and waits for the `settings.models.footer`
declaration instead of racing it. The injected face is what the renderer's own
contract produces (`hooks.modelRetryCard` becomes `props.useModelRetryCard`), and
the card renders through `react-dom/server` with the real
`@deepseek-ai/dsh-client-ui-primitives`. Finally, every draft rule of the card's
field specs: whole numbers become `set` ops, an empty draft on an overridden field
becomes `unset`, a draft equal to the effective value writes nothing, and an
out-of-range or fractional draft blocks the save instead of reaching the host.

[`test/README.md`](../test/README.md) carries the same map next to the code.

Nothing is stubbed except the browser-only collaborators the Vite web build
bundles away (`shiki`, `katex`, `simple-icons`, the `micromark-*` family and
friends) and the CSS-module imports; none of them participate in the behaviour
under test. `.test-workspace/` and `dist/` are generated and are not committed.

## Branch and commit conventions

- Branch from `main`; keep one topic per branch (`fix/...`, `feat/...`, `docs/...`).
- Keep commits small and focused.
- Write imperative, scoped commit messages, e.g. `fix(host): leave always policies alone`.
- Rebase onto the latest `main` before requesting review; avoid merge commits inside the PR branch.

**Sign-off.** This project follows the Developer Certificate of Origin: end every
commit message with a `Signed-off-by: Your Name` line, using the name and address
of your own commit identity. `git commit -s` writes it for you. A sign-off states
that you wrote the change or otherwise have the right to contribute it.

## Pull requests

Every pull request must:

- Explain **what** changed and **why**.
- Link the issue it closes (`Closes #123`).
- Pass CI.
- Update documentation whenever user-facing text or behavior changes — including
  both the English and the Chinese copy in `lib/client.js`'s locale dictionaries.
- Contain no secrets, tokens, private keys, internal hostnames, or personal data.
- State the license of any newly added dependency and confirm it is compatible with
  this project's `MIT` license.

Use the repository's pull request template. Do not delete checklist items without
explaining why.

## Reporting bugs

A useful bug report contains:

- The version, commit SHA, or release tag of the plugin you tested.
- The DeepSeek Harness build you ran it against, and how the plugin was installed
  (the packed tarball through Settings → Plugins, or a CLI-managed profile).
- Operating system and runtime version.
- Which surface misbehaved: the switch, the `Max retries` field, the save, or the
  retry policy a failed request actually used.
- Exact reproduction steps, expected result, and actual result.
- Logs with secrets and personal data removed.

Report security vulnerabilities privately — see [SECURITY.md](SECURITY.md). Never open
a public issue for a vulnerability.

## Coding style

- Match the style of the surrounding code; do not reformat unrelated files.
- Keep the two halves apart: `lib/index.js` runs in the host process,
  `lib/client.js` runs in the browser, and neither may assume the other's modules.
- `lib/client.js` is the loader's factory form. It may require only the platform
  seeds (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`),
  anything declared in `dsh.client.inject` in `package.json`, or its own code.
- Never let `apply()` throw: the web shell fails its entire boot when a plugin's
  `apply` throws. Mount problems are logged, not raised.
- The entry id, the settings namespace, `ctx.configForms.get(...)` and the
  `settings.models.footer` registration id are all `model-retry-settings`. Keep
  them in step, `cordis.patch.yml` included, and keep `MAX_RETRIES_LIMIT` equal in
  both halves — a client half cannot import the host package.
- Add or update a check in `test/` for behavior changes; the suites are plain
  Node scripts with no test framework.
- Do not add a dependency for something the standard library already does.

## Review process

Maintainers review pull requests as time allows. Expect at least one round of
feedback. Address comments with follow-up commits or a rebase, then re-request review.
A pull request inactive for 60 days without response may be closed.

## License

By contributing, you agree that your contributions are licensed under the `MIT`
license of this repository — inbound equals outbound, and no separate contributor
license agreement is required. Do not paste code you cannot license under these terms.

## Questions

Open an issue or a discussion on the repository.

---

# 为 icrefin/dsh-model-retry-settings 贡献

感谢你抽出时间参与贡献。本文适用于 `icrefin` 名下的仓库 **dsh-model-retry-settings**。

## 贡献方式

- 用 *Bug report* 表单报告问题。
- 用 *Feature request* 表单提出需求。
- 改进文档、示例或翻译。
- 提交 pull request，修复或实现 issue 中的事项。

如果改动较大，请先开 issue 讨论设计，以免实现在错误的方向上白费功夫。

## 开始之前

1. 先搜索已有的 issue 和 pull request，避免重复。
2. 阅读[行为准则](CODE_OF_CONDUCT.md)。
3. 查看 README 中说明的支持版本与前置条件。

## 开发环境

**没有构建步骤**：`lib/index.js`（宿主侧）与 `lib/client.js`（浏览器侧）都是按 dsh 加载
它们的形式手写的，本身就是发布的 bundle。克隆下来就已经拿到完整的包。

`package.json`（`engines`）声明的是 Node `^22.19.0 || >=24.0.0`；验证用的测试跑在
Node 22 这条线上。

```bash
git clone https://github.com/icrefin/dsh-model-retry-settings.git
cd dsh-model-retry-settings
sh scripts/verify.sh
```

### 验证是怎么做的

`sh scripts/verify.sh` 就是 CI 跑的那套，而且它针对的是**真实的** dsh SDK 而不是 mock：
`test/setup.mjs` 从已安装桌面应用的 `app.asar` 里取出 `@deepseek-ai/*` 包，装上它们依赖的
浏览器侧 npm 协作者，再把本包自己的 `lib/` 软链进 `.test-workspace/`，这样被测代码绝不可能
与 `package.json` 导出的东西脱节。因此它需要 DeepSeek Harness 桌面应用在场（安装位置非默认
时设置 `DSH_ASAR`），并且首次运行需要网络。

| 命令 | 作用 |
| --- | --- |
| `sh scripts/verify.sh` | 先 `node test/setup.mjs`，再跑下面两套 —— 共 37 项检查 |
| `node --import ./test/dsh-hooks.mjs test/host.test.mjs` | 宿主侧，17 项检查 |
| `node --import ./test/dsh-hooks.mjs test/client.test.mjs` | 浏览器侧，20 项检查 |
| `sh scripts/install.sh` | 把插件打包到 `dist/` 并打印安装路径 |
| `sh scripts/dev-profile.sh boot` | 在隔离 profile 里启动插件（`:19499`，只写 `.dev-home/`） |
| `node tools/preview.mjs` | 在 GUI 之外渲染 `lib/client.js` 并给卡片截图 |

**宿主侧 17 项。** 导出的 `Config` 能通过校验、给两个字段填默认值，并把两者都标为
`.volatile()`；Loader 交给 `apply()` 的是活引用，所以每个字段都必须用 `.get()` 读。
`resolveEffectiveConfig` 能处理活引用、普通值和缺字段三种情况，并在数值超出契约时回落到
随附默认值。`apply()` 以 `{ prepend: true }` 注册 `agent/request-error` 监听器，而且 ——
通过真实的 `cordis` `Context` 验证过 —— 该监听器确实是 waterfall 最外层的持有者，因此会
先于后注册的重试执行器运行；下面这些检查都不对处理函数本体做任何打桩。监听器会改写执行器
所读 payload 上的 `retryPolicy.maxRetries`，对 `always` 策略和缺省策略不做改动，在关闭时
是空操作，永不修改被冻结的提供方策略，并保留其余所有策略字段。`apply()` 之后被改动的
volatile 值 —— 也就是 Loader 的 `ConfigEditor` 所做的原地更新 —— 会在下一次失败时被观察到，
无需重新 `apply()`、无需重启、也没有订阅。

**浏览器侧 20 项。** bundle 只注册一个工厂，id 就是启动图那一行携带的包名；并在*物化*时注入
一个 `<style>` 标签，且故意不打标记，这正是加载器 `claimStyles` 期望的形式。`apply()` 绑定
`model-retry-settings` 命名空间、注册 locale 字典、用 `configForms.whileServed` 给卡片加门禁，
并且等待 `settings.models.footer` 的声明而不是去抢跑。注入的 face 正是渲染器自身契约产出的
形状（`hooks.modelRetryCard` 变成 `props.useModelRetryCard`），卡片则用真实的
`@deepseek-ai/dsh-client-ui-primitives` 通过 `react-dom/server` 渲染。最后是卡片字段规格的
每一条草稿规则：整数会变成 `set` 操作，已覆盖字段上的空草稿会变成 `unset`，与生效值相同的
草稿不写任何东西，而越界或小数的草稿会阻止保存、根本到不了宿主。

[`test/README.md`](../test/README.md) 在代码旁边列了同样一张表。

除了 Vite Web 构建会打包掉的浏览器侧协作者（`shiki`、`katex`、`simple-icons`、
`micromark-*` 系列等）和 CSS module 导入之外，没有任何东西被打桩；它们都不参与被测行为。
`.test-workspace/` 与 `dist/` 是生成物，不纳入版本库。

## 分支与提交规范

- 从 `main` 拉分支，一个分支只做一件事（`fix/...`、`feat/...`、`docs/...`）。
- 提交粒度尽量小。
- 提交信息用祈使句并带范围，例如 `fix(host): leave always policies alone`。
- 请求评审前先 rebase 到最新的 `main`；PR 分支内避免合并提交。

**Sign-off。** 本项目遵循 Developer Certificate of Origin：每条提交信息末尾都要有
`Signed-off-by: Your Name`，用你自己提交身份的名字与地址。`git commit -s` 会自动写上。
sign-off 表示这次改动是你写的，或者你有权提交它。

## Pull request 要求

每个 pull request 必须：

- 说明改了**什么**、**为什么**改。
- 关联对应 issue（`Closes #123`）。
- 通过 CI。
- 当用户可见文案或行为变化时更新文档，包括 `lib/client.js` 语言字典中的中英文文案。
- 不含任何密钥、令牌、私钥、内网主机名或个人数据。
- 说明新增依赖的许可证，并确认与本项目的 `MIT` 许可证兼容。

请使用仓库的 pull request 模板；不要在没有说明理由的情况下删除检查项。

## 报告 bug

一份有效的 bug 报告应包含：

- 你测试的插件版本号、commit SHA 或发布标签。
- 你运行它所用的 DeepSeek Harness 版本，以及插件的安装方式（从 Settings → Plugins
  装的 tarball，还是 CLI 管理的 profile）。
- 操作系统与运行时版本。
- 出问题的是哪一面：开关、`Max retries` 字段、保存，还是失败请求实际使用的重试策略。
- 精确的复现步骤、期望结果与实际结果。
- 去除密钥与个人信息后的日志。

安全漏洞请私下报告，见 [SECURITY.md](SECURITY.md)。切勿为漏洞开公开 issue。

## 代码风格

- 与周边代码风格保持一致；不要顺手重排无关文件。
- 保持两侧分离：`lib/index.js` 跑在宿主进程，`lib/client.js` 跑在浏览器，两边都不能假设
  能拿到对方的模块。
- `lib/client.js` 是加载器的工厂形式。它只允许 require 平台 seed（`react`、
  `react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`）、`package.json` 里
  `dsh.client.inject` 声明的模块，或它自己的代码。
- 绝不要让 `apply()` 抛异常：插件的 `apply` 一抛，整个 Web shell 的启动都会失败。挂载问题
  只记录，不抛出。
- 条目 id、settings 命名空间、`ctx.configForms.get(...)` 和 `settings.models.footer` 的
  注册 id 都是 `model-retry-settings`，请保持一致，`cordis.patch.yml` 也一样；并让两侧的
  `MAX_RETRIES_LIMIT` 相等 —— 客户端这一半无法 import 宿主包。
- 行为变更请在 `test/` 里新增或更新检查；测试是普通 Node 脚本，没有测试框架。
- 标准库已能实现的功能，不要新增依赖。

## 评审流程

维护者会在时间允许时评审 pull request，通常至少有一轮反馈。请通过后续提交响应意见，
或推送 rebase 后重新请求评审。超过 60 天无回应的 pull request 可能被关闭。

## 许可证

参与贡献即表示你同意自己的贡献按本仓库的 `MIT` 许可证授权 —— 入站即出站（inbound equals
outbound），无需另签贡献者许可协议。请勿粘贴你无权按此条款授权的代码。

## 疑问

请在仓库里开 issue 或 discussion。
