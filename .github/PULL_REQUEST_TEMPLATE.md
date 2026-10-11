## Summary / 概述

<!-- What changed and why. Link the issue: Closes #123 -->
<!-- 改了什么、为什么改。关联 issue：Closes #123 -->

## Type of change / 变更类型

- [ ] Bug fix / 缺陷修复
- [ ] New feature / 新功能
- [ ] Breaking change / 破坏性变更
- [ ] Refactor or performance / 重构或性能
- [ ] Documentation or examples / 文档或示例
- [ ] CI, build, or dependencies / CI、构建或依赖

## How it was verified / 验证方式

<!-- Exact commands, test names, or steps a reviewer can repeat. -->
<!-- 评审者可复现的确切命令、测试名称或步骤。 -->

```bash
# sh scripts/verify.sh                        # the host and browser suites, 37 checks
# node --import ./test/dsh-hooks.mjs test/host.test.mjs
# node --import ./test/dsh-hooks.mjs test/client.test.mjs
# node tools/preview.mjs --out /tmp/preview   # optional: render the card PNG
```

## Checklist / 检查清单

- [ ] Tested locally, and the commands above pass / 已在本地测试，且上述命令通过
- [ ] Checks added or updated in `test/` for behavior changes / 行为变更已在 `test/` 中新增或更新检查
- [ ] Docs updated (README, TSDoc comments, `test/README.md`) / 文档已更新（README、TSDoc 注释、`test/README.md`）
- [ ] English and Chinese copy updated together when user-facing text changed (`lib/client.js` locales) / 用户可见文案变化时已同步更新中英文文案（`lib/client.js` 的语言字典）
- [ ] Entry id, settings namespace, `configForms.get(...)` id and slot id still all read `model-retry-settings` / 条目 id、settings 命名空间、`configForms.get(...)` 的 id 与 slot id 仍然都是 `model-retry-settings`
- [ ] No secrets committed — no API keys, tokens, passwords, private keys, `.env` files, or personal data / 未提交任何密钥 —— 无 API key、令牌、密码、私钥、`.env` 文件或个人数据
- [ ] License of new dependencies checked and compatible with `MIT` / 已核查新增依赖的许可证，且与本项目的 `MIT` 兼容
- [ ] Pull request targets `main` and is rebased on its latest commit / PR 目标分支为 `main`，且已 rebase 到其最新提交
- [ ] Commits are focused, messages follow the project convention, and each carries a sign-off / 提交粒度合理，提交信息符合项目规范，且每条都带 sign-off

## Screenshots or logs (optional) / 截图或日志（可选）

<!-- Remove anything sensitive before pasting. A settings document can carry
     provider names, base URLs, or credentials — redact them. -->
<!-- 粘贴前请先删除敏感内容。settings 文档里可能有提供方名称、base URL 或凭据 —— 请隐去。 -->

## Notes for reviewers / 给评审者的说明

<!-- Tradeoffs, follow-up work, or parts you are unsure about. -->
<!-- 取舍、后续工作，或你不确定的部分。 -->
