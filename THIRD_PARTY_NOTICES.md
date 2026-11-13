# 第三方许可声明

本项目基于以下开源项目深度改造，其原始代码与设计保留原有许可证：

## DeepSeek Harness (DSH)

- 仓库：https://github.com/deepseek-ai/deepseek-harness
- 许可证：MIT
- 用途：底层 Agent Runtime（agent-loop、session、tools、skill、subagent、team、sandbox 等）
- 引用方式：作为 `packages/core`、`packages/llm`、`packages/subagent`、`packages/team`、`packages/skill` 等模块的基础

## Tobs / DeepSeekBot (BotHarness)

- 仓库：https://github.com/BotHarness/DeepSeekBot
- 许可证：MIT
- 用途：Bot 应用层（PersonaBot、Memory、Channel、Orchestrator、Assignment、Approval、IM Connectors）
- 引用方式：作为 `packages/bot` 的基础

## Cordis

- 仓库：https://github.com/cordiverse/cordis
- 许可证：MIT
- 用途：插件框架（DSH 的依赖）
- 引用方式：`vendor/cordis`

## 说明

上述项目的 MIT 许可证允许修改、再发布与商业使用，前提是保留原始版权声明与许可证文本。
本项目的**新增代码**同样采用 MIT 许可证。

被明确排除的项目：

- **OpenBot (CopilotKit)** — 开源许可不够自由，不纳入本项目技术路线。
