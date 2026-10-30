# dsh-model-retry-settings

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件：在 Web GUI 的 **Settings → Model** 页面加上**最大重试次数**控件，这是随附组合里唯一没有界面的那项偏好。
[English](README.md) | **简体中文**

[![License](https://img.shields.io/github/license/icrefin/dsh-model-retry-settings?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/icrefin/dsh-model-retry-settings?style=flat-square)](https://github.com/icrefin/dsh-model-retry-settings/releases/tag/v1.0.2)
[![Last commit](https://img.shields.io/github/last-commit/icrefin/dsh-model-retry-settings?style=flat-square)](https://github.com/icrefin/dsh-model-retry-settings/commits/main)
[![Stars](https://img.shields.io/github/stars/icrefin/dsh-model-retry-settings?style=flat-square)](https://github.com/icrefin/dsh-model-retry-settings/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/icrefin/dsh-model-retry-settings/pulls)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5-4B5563?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

**Request retries** —— **Settings → Model** 页面最下方的一张卡片，决定模型请求失败后
重试多少次，对本配置中的所有提供方生效。

## 它做什么

dsh 的请求重试策略是**按提供方路由**解析的：适配器的 `providerRetryPolicy()` 在该路由
注册时被捕获（`@deepseek-ai/dsh-llm/retry-policy`），agent loop 在每次请求失败时把解析好
的策略带进 `agent/request-error` waterfall，可选的 `@deepseek-ai/dsh-llm-retry` 插件再把它
执行为持久的 `llm/retry` 事件。而随附的组合里没有任何地方能让人改动这个数字 —— 除非手动
去改提供方配置。

这个插件把这个偏好接管过来：

- 它借用**自己的 Loader 条目的 `Config`** 作为 settings 命名空间 —— 从 dsh 0.1.7 起，
  一个条目的 Config *就是* 它的 settings 命名空间，因此两个字段都是 `.volatile()`，
  可以通过常规的 settings 通道写入；
- 浏览器这一半把控件渲染进 Models 页面预留的扩展位置 `settings.models.footer`；
- 宿主这一半改写下重试执行器即将读取的那份策略。

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `enabled` | boolean | `true` | 关闭时，各提供方自己的重试策略原样生效。 |
| `maxRetries` | integer 0–50 | `5` | 一次失败的模型请求最多重试多少次。`0` 表示不重试。 |

`5` 是 dsh 自己的随附默认值（`@deepseek-ai/dsh-llm/retry-policy` 里的
`DEFAULT_MAX_RETRIES`），所以在改动之前，全新安装的行为和原版一致。

## 它在页面中的位置

```
Settings ▸ Model
├── DeepSeek account                     [provider row]
├── Example provider                     [provider row]
├── + Add provider
└── Request retries                      ← this plugin
     ├── Override provider retry policy  [switch]
     └── Max retries                     [whole number, 0–50]
```

*（提供方行取决于本部署配置了什么；第二行是占位示意。）*

![Settings → Model 页面：两行提供方、添加提供方的控件，以及它们下方本插件的 Request retries 卡片](docs/images/settings-model-retries.png)

*卡片渲染在提供方行和添加控件下方。由 [`tools/preview.mjs`](tools/preview.mjs)
从随包发布的 bundle 渲染而成。*

## 覆盖是怎么生效的

宿主这一半在 `agent/request-error` waterfall 上注册一个带 `{ prepend: true }` 的监听器。
`ctx.waterfall` 是**最外层优先**组合的，所以被 prepend 的监听器会先于 `dsh-base` 注册的
重试执行器运行 —— 而被替换掉的策略，正是那个执行器从同一个 payload 对象上解构出来的：

```js
ctx.on('agent/request-error', (payload, next) => {
  const { enabled, maxRetries } = resolveEffectiveConfig(config)
  const policy = payload?.retryPolicy
  if (enabled && policy?.mode === 'normal' && policy.maxRetries !== maxRetries) {
    payload.retryPolicy = Object.freeze({ ...policy, maxRetries })
  }
  return next()
}, { prepend: true })
```

其余机制全部留在 `dsh-llm-retry` 那边：持久化的重试计数及其 `sessionProjections` 状态、
退避时间表，以及轨迹里渲染的 `llm/retry` / `llm/retry-started` 会话事件。本插件只改这个数字。

几点值得知道的后果：

- **只有 `mode: 'normal'` 的策略带 `maxRetries`。** `always` 策略会完全按提供方声明的那样
  保留，缺省策略也一样。
- **这个值是替换，不是封顶。** 设成高于提供方声明的预算就会把它抬高；提供方的
  `retryPolicyKey` 随之变化，因此持久化重试计数能干净地跟随新策略。
- **没有组合 `dsh-llm-retry` 时，这个偏好没有任何效果** —— 没有执行器就根本不会重试。
  `dsh-llm-retry` 在 `dsh-base` 里，所以每个随附 profile 都有它。
- volatile 值是在运行中的 fiber 上**原地更新**的，因此监听器在每次失败时读到的都是当前值：
  不需要订阅、不需要重新 `apply()`、不需要重启。Settings 页面自己的保存是唯一的写入口。

## 环境要求

| 要求 | 原因 |
|---|---|
| DeepSeek Harness `>=0.2.1-rc.5 <0.2.2-0` | 本插件构建与验证所针对的区间（0.2.1-rc.5）；卡片需要 Models 设置页的 `settings.models.footer` 位置 |
| Node `^22.19.0 \|\| >=24.0.0` | `package.json`（`engines`）声明的范围 |
| 组合了 `@deepseek-ai/dsh-llm-retry` | 重试执行器本身；它随 `dsh-base` 一起发布，所以每个原版 profile 都有 |
| Google Chrome，仅 `node tools/preview.mjs` 需要 | 预览工具在 GUI 之外渲染卡片并用无头 Chrome 截图；插件本身和两套测试都不需要浏览器 |
| Node，`sh scripts/verify.sh` 需要 | 另外还需要 DeepSeek Harness 桌面应用与首次运行时的网络，见下 |

`sh scripts/verify.sh` 会从已安装桌面应用的 `app.asar` 里取出真实的 `@deepseek-ai/*` 包，
所以它需要那个应用在场（安装位置非默认时设置 `DSH_ASAR`），并且首次运行需要网络。Web 外壳
以平台种子方式内联的客户端包（`dsh-client-ui-primitives`、`dsh-client-ui-slots`、
`dsh-client-store`）已不再安装在该应用的 `node_modules` 下，因此验证工具会按该应用自身的版本
从 npm 取这三个包。也正因为如此，这两套测试没有接入云端 CI：本仓库不提供 workflow，
`sh scripts/verify.sh` 就是在装好 DeepSeek Harness 的机器上执行的关卡。

## 安装

本仓库是独立的插件包：`lib/index.js`（宿主）和 `lib/client.js`（浏览器）都已按 dsh 加载
它们的形式提交在仓库里。

```sh
git clone https://github.com/icrefin/dsh-model-retry-settings.git
cd dsh-model-retry-settings

sh scripts/install.sh                 # pack to dist/, then print what to do
sh scripts/install.sh --profile tui   # pack and install into a CLI-managed profile
sh scripts/verify.sh                  # check the checkout against the real dsh SDK
```

**桌面** profile 归应用所有，所以 `dsh plugin add` 会拒绝它：请从
**Settings → Plugins** 安装打包好的 tarball，或者把
`dist/dsh-model-retry-settings-<version>.tgz` 交给插件管理器工具。

有两点是关键：

- **装 tarball，不要装目录。** `link:` 依赖指向 profile 的 `node_modules` 之外，宿主只有在
  启动时把该路径登记为 linked root 之后才能找到它。打包成 tarball 则装成
  `<profile>/node_modules/` 下的真实目录，和来自 registry 的插件形态一致，因此 profile
  一加载它，安装层的模块拦截就能解析它的 `@deepseek-ai/*` peer。
- **加进去之后要重启 harness。** 加到*已经在运行*的 profile 里的 bundle，那个进程无法
  import：新模块路径不在宿主启动时算出的解析结果里，于是条目报 `failed to import` 并保持
  未激活。任何新增 bundle 都是这样，与本插件无关 —— 往已安装副本里塞一个
  `export function apply() {}` 也会同样失败，而同一个 bundle 下次启动就能正常激活。
  插件管理器把这种情况报告为 `restart-required`。

重启之后打开 **Settings → Model**；卡片就在提供方行和添加控件下方。保存即通过共享的
settings 通道写入该偏好。

要迭代插件：改 `lib/`，跑 `sh scripts/install.sh`，然后重启 —— 或者用
`sh scripts/dev-profile.sh` 装进一个随手可弃的 profile，那里 `link:` 式的迭代很便宜。

## 配置

卡片是唯一的入口。没有需要编辑的 Loader 配置文件，也没有 settings 文档之外的插件状态。

| 什么 | 在哪里 |
|---|---|
| 这项偏好 | `model-retry-settings` settings 命名空间里的 `enabled` 与 `maxRetries` 两个字段 |
| 这个命名空间是什么 | 本插件自己的 Loader 条目 `Config`（`cordis.patch.yml` 里的 `id: model-retry-settings`）—— 从 dsh 0.1.7 起，条目的 Config *就是* 它的 settings 命名空间 |
| 卡片如何读写它 | `ctx.configForms.get('model-retry-settings')`，即宿主发布的同一个带围栏的共享表单，因此保存是一次普通的 settings 变更，而宿主始终是「值是否被接受」的唯一权威 |
| 运行中的进程会怎样 | 不需要重启：两个字段都是 `.volatile()`，保存会在运行中的 fiber 上原地更新，下一次失败请求读到就是新值 |

条目 id、settings 命名空间、客户端的 `ctx.configForms.get(...)` 以及
`settings.models.footer` 的注册 id 都是 `model-retry-settings`，必须一致；
`cordis.patch.yml` 里也是同一个值。

**没有构建步骤。** `lib/index.js`（宿主）和 `lib/client.js`（浏览器）都是按 dsh 加载它们
的形式手写的 —— 宿主是普通 ESM，浏览器是模块加载器的
`window.__ModuleLoader__.load({ id, factory })` 工厂形式，这也是本插件不需要打包器的原因。

开发脚本，都在克隆目录里运行：

```sh
sh scripts/verify.sh           # 37 checks against the real dsh SDK (host + browser halves)
sh scripts/install.sh          # pack to dist/ and print the install path
sh scripts/dev-profile.sh boot # boot this plugin in an isolated profile on :19499
sh scripts/dev-profile.sh dump # print the composed profile tree
sh scripts/dev-profile.sh url  # print the served client-bundle URL
sh scripts/dev-profile.sh remove
```

`sh scripts/dev-profile.sh` 只往克隆目录里的 `.dev-home/` 写：一个带自己 profile 的私有
dsh home，所以桌面应用正在用的那个 profile 绝不会被碰到。那里也是验证改动最便宜的地方
—— 一次全新启动就会把插件组合进 profile，于是它直接激活。
[`test/README.md`](test/README.md) 写明了每套测试各自证明了什么。

## 限制

- 只有一个全局偏好。按提供方的重试预算仍属于提供方配置的事
  （`dsh-llm-pi-ai` 里的 `providers.<name>.retryPolicy`）。
- `always` 重试模式无法触及 —— 按设计它就没有 `maxRetries`。
- `maxRetries` 上限为 50。schema 与浏览器字段共用这个边界，所以被拒绝的草稿根本到不了
  Host；但想要更高上限的部署必须在两侧同时改 `MAX_RETRIES_LIMIT`。
- 没有针对单个会话的重试预算入口；这个值是进程级的。

## 常见问题

**Settings → Model 里看不到卡片。**
客户端这一半只在宿主仍在提供 `model-retry-settings` 命名空间时才注册卡片
（`ctx.configForms.whileServed`），所以从没组合过宿主那一半的 profile 根本不会显示卡片
—— 一张无法保存的卡片就不该出现。请确认 bundle 已在 profile 里，并且安装之后重启过 harness。

**安装之后条目报 `failed to import`。**
对刚加进正在运行的 profile 的 bundle 来说这是预期行为：宿主的模块解析是启动时算好的，
新路径不在里面。重启 harness 即可，同一个 bundle 下次启动就能正常激活。插件管理器把这种
情况报告为 `restart-required`。

**改了数字却什么也没重试。**
先看开关：*Override provider retry policy* 关闭时，各提供方自己的策略原样生效，而 `0`
是刻意表示不重试。再看提供方的模式：只有 `mode: 'normal'` 的策略带 `maxRetries`，
`always` 策略会完全按声明保留。最后，没有组合 `dsh-llm-retry` 的 profile 根本不会重试。

**把数字调到低于提供方预算，却还是重试了那么多次。**
这个值是**替换**策略而不是封顶，所以一张过期的卡片、第二个在跑的 harness，或者被重新解析
的提供方策略，都会让人以为设置被忽略了。重新打开卡片看看宿主实际提供的值，并确认只有一个
harness 在服务这个 profile。

**Save 按钮不接受我的草稿。**
该字段只接受 0 到 50 的整数；其他内容会被就地标记为无效并阻止保存，因此被拒绝的草稿根本
到不了宿主。清空该字段表示清除这个值，即回落到组合默认值。

## 许可证

MIT —— 见 [LICENSE](./LICENSE)。

> 如果这张卡片帮你省下了一次手改提供方配置，一颗 ⭐ star 能帮更多 dsh 用户发现它。

<sub>针对 DeepSeek Harness 0.2.1-rc.5 构建 · MIT</sub>
