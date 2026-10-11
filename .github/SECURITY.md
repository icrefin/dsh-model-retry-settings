# Security Policy

## Supported versions

Only the versions below receive security fixes. Older releases are provided "as-is" —
upgrade to a supported line before reporting.

| Version | Supported | Notes |
| --- | --- | --- |
| `main` (latest commit) | :white_check_mark: | Active development |
| Latest tagged release | :white_check_mark: | Fixes are backported when practical |
| Older tagged releases | :x: | Upgrade to the latest release |
| Forks and modified copies | :x: | Report to the maintainer of that fork |

## Reporting a vulnerability

**Do not open a public issue, discussion, or pull request for a security problem.**
A public report exposes every user before a fix exists.

Report privately through GitHub Security Advisories: open
`https://github.com/icrefin/dsh-model-retry-settings/security/advisories/new`
(repository → *Security* → *Advisories* → *Report a vulnerability*). The report stays
private and gives us a private fork in which to prepare the fix. A direct message to
the maintainer on GitHub works too, but the advisory is preferred because it keeps the
whole exchange in one private thread.

Include in your report:

- Affected version or commit, plus the dsh build and the deployment you ran it in.
- A minimal reproduction (proof of concept, settings document, or test case).
- Impact assessment: what an attacker gains, and under which preconditions.
- Any fix or mitigation you already know of.
- Whether you intend to publish, and the name you want used for credit.

## Our commitments

| Stage | Target |
| --- | --- |
| Acknowledge receipt | 3 business days |
| Initial assessment and severity triage | 10 business days |
| Fix or documented mitigation | 30 days for high/critical, best effort otherwise |
| Public disclosure | Coordinated with you, after a fix is available |

We credit you in the advisory unless you ask us not to. We will not pursue legal action
against researchers who act in good faith, avoid privacy violations, avoid service
disruption, and give us reasonable time to fix the issue before disclosure.

## Scope

In scope:

- The code in this repository (`icrefin/dsh-model-retry-settings`), including the
  published package and the CI workflow.
- Vulnerabilities exploitable with the default configuration. The plugin has no
  configuration of its own: it reads and writes one settings namespace, and the
  settings document is the state.
- The preference itself: the host half substitutes `retryPolicy.maxRetries` on the
  `agent/request-error` payload a retry executor is about to read. A way to make it
  write outside its own `model-retry-settings` namespace, to make it alter a policy
  it must leave untouched (an `always` policy, an absent policy, or another
  plugin's namespace), or to make the card write a value the host would otherwise
  reject is a vulnerability.
- Both halves of the bundle: `lib/index.js` in the host process and `lib/client.js`
  in the browser.

Out of scope:

- Vulnerabilities in third-party dependencies — report those upstream; tell us only if
  this project becomes exploitable as a result.
- The behavior of `@deepseek-ai/dsh-llm-retry` and the rest of the harness itself.
  Report those to the DeepSeek Harness project.
- Social engineering, physical access, and volume-based denial of service.
- Spam, missing rate limits on endpoints documented as unauthenticated, and self-XSS.
- Issues that require an already-compromised machine or a modified local build.
- Anything on a host you do not own or have written permission to test.
- Another process on the same machine reading the profile's settings document, or an
  operator hand-editing that document. The preference is an ordinary setting of the
  profile that hosts it; that is documented behavior, not a vulnerability by itself.

## Safe harbor

If you follow this policy, we consider your research authorized, will work with you to
understand and fix the issue, and will not recommend or support legal action against you.

## Handling secrets in reports

Redact tokens, API keys, provider credentials, and personal data before you paste
anything. If a live credential must be shown, tell us first and rotate it immediately
afterwards.

---

# 安全策略

## 支持的版本

只有下表中的版本会收到安全修复。更早的版本按“现状”提供 —— 报告前请先升级到受支持的分支。

| 版本 | 是否支持 | 说明 |
| --- | --- | --- |
| `main`（最新提交） | :white_check_mark: | 活跃开发 |
| 最新的发布标签 | :white_check_mark: | 可行时会回合修复 |
| 更早的发布标签 | :x: | 请升级到最新发布版 |
| 分支（fork）与改动过的副本 | :x: | 请向该分支的维护者报告 |

## 报告漏洞

**请勿为安全问题开公开 issue、discussion 或 pull request。**
公开报告会在修复发布之前就暴露给所有用户。

请通过 GitHub Security Advisories 私下报告：打开
`https://github.com/icrefin/dsh-model-retry-settings/security/advisories/new`
（仓库 → *Security* → *Advisories* → *Report a vulnerability*）。报告保持私密，同时给我们
一个私有分支用于准备修复。在 GitHub 上直接私信维护者也可以，但更推荐用 advisory，这样整条
沟通线索都留在同一个私密会话里。

报告中请包含：

- 受影响的版本或 commit，以及你运行的 dsh 版本与所属部署。
- 最小可复现样例（PoC、settings 文档或测试用例）。
- 影响评估：攻击者能获得什么，前置条件是什么。
- 你已知的修复或缓解方式。
- 是否打算公开，以及你希望使用的署名。

## 我们的承诺

| 阶段 | 目标 |
| --- | --- |
| 确认收到 | 3 个工作日 |
| 初步评估与严重性定级 | 10 个工作日 |
| 修复或书面缓解方案 | 高危/严重 30 天内，其余尽力而为 |
| 公开披露 | 与你协商，且在修复可用之后 |

除你要求匿名外，我们会在公告中署名致谢。对于善意研究 —— 不侵犯隐私、不中断服务、
并在披露前给我们合理的修复时间 —— 我们不会采取法律行动。

## 范围

在范围内：

- 本仓库（`icrefin/dsh-model-retry-settings`）的代码，包括其发布的包与 CI 工作流。
- 使用默认配置即可触发的漏洞。本插件自身没有任何配置：它只读写一个 settings 命名空间，
  settings 文档就是状态。
- 这项偏好本身：宿主侧会替换即将被重试执行器读取的 `agent/request-error` payload 上的
  `retryPolicy.maxRetries`。若能让它写到自己的 `model-retry-settings` 命名空间之外、
  让它改动本不该改动的策略（`always` 策略、缺省策略，或别的插件的命名空间），
  或让卡片写进一个宿主本会拒绝的值，都算漏洞。
- bundle 的两半：宿主进程里的 `lib/index.js` 与浏览器里的 `lib/client.js`。

不在范围内：

- 第三方依赖自身的漏洞 —— 请报告给上游；仅当本项目因此变得可被利用时再告知我们。
- `@deepseek-ai/dsh-llm-retry` 以及 harness 自身的行为。请报告给 DeepSeek Harness 项目。
- 社会工程、物理访问，以及靠流量压垮服务的拒绝服务。
- 垃圾信息、已声明为免认证接口的限流缺失，以及 self-XSS。
- 需要已失陷主机或被改动的本地构建才能成立的问题。
- 任何你并不拥有、也没有书面授权测试的主机。
- 同一台机器上的其他进程读取该 profile 的 settings 文档，或运维人员手改该文档。这项偏好
  就是承载它的 profile 的一个普通设置项；这是有文档记录的行为，本身不算漏洞。

## 安全港

只要你遵循本策略，我们视你的研究为已授权，会与你一起理解并修复问题，
并且不会建议或支持对你采取法律行动。

## 报告中的密钥处理

粘贴任何内容之前，请先隐去令牌、API key、提供方凭据与个人信息。若必须展示有效凭据，
请先告知我们，并在其后立即轮换。
