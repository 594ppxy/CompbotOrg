# CompBotOrg UI Design Brief — Reference Is the Source of Truth

> **重要：实现时以设计参考图为最高优先级。不要以当前仓库里的 CEO Workspace 代码作为视觉参考。当前实现只是功能实验，视觉方向可能偏离目标，需要按参考图重新设计。**

## 设计目标

CompBotOrg 是一个建立在 DSH/DSHBot 之上的 AI Organization OS。

核心产品原则：

- **聊天是主界面，组织是骨架。**
- 老板只需要和 CEO 沟通目标。
- CEO 负责拆解目标、委派、协调、跟进、验收、汇报。
- Bot 在产品里不是“工具列表”，而是组织中的“员工”。
- 部门、员工、项目、任务、上下级和协作关系都应该自然地呈现在一个统一工作台里。

## 视觉参考

设计必须严格参考项目负责人提供的原始设计图（即之前讨论中“AI Organization / CEO 指挥中心”的那张图）。

参考对话：
https://chatgpt.com/s/m_6af7cf7a460881919da8896d884a754c

**注意：当前仓库已有的 CEO Workspace 不代表最终设计。不要围绕现有组件继续堆 UI；应该根据参考图重新校准布局、层级、间距、卡片比例、导航和信息密度。**

## 核心布局

目标结构是一个真正的组织协同工作台，而不是单独的一张 Dashboard：

1. **左侧：组织导航**
   - CEO
   - 部门
   - 全部员工
   - 项目
   - 可按组织/部门/项目分组
   - 员工在线/工作状态应该一眼可见

2. **中间：主工作区**
   - 默认是 CEO 对话
   - CEO 对话是整个系统的核心入口
   - 对话旁/下方自然出现目标、任务拆解、执行状态、待决策事项等结构化信息
   - 不要把聊天挤成一个小窗口

3. **右侧：上下文/组织详情**
   - 当前 CEO / 员工 / 部门 / 项目详情
   - 职位、上级、下属、负责任务、项目、状态
   - 关系网络
   - 需要时出现，不抢占主聊天空间

4. **组织关系**
   - 老板 → CEO → 部门负责人 → 专家员工是最常见路径
   - 但底层必须支持图关系，而不是只能做树
   - supports: manages / reports_to / member_of / collaborates / advisor_of / project_lead / delegates_to

## 交互原则

- 老板不应该被迫手动创建几十个任务。
- 老板给 CEO 一个自然语言目标即可。
- CEO 应自动形成：Goal → Project → Task → Assignment → Report → Review → Result。
- CEO 可以通过 DSHBot 现有能力 `@` 员工、发消息、使用群聊完成委派和协作。
- 用户点开员工后，应该像打开一个真实员工的工作档案，而不是一个普通 Bot 设置页。
- 用户点开项目后，应看到任务流和参与员工。
- 状态应清晰：Pending / Running / Review / Blocked / Done。

## 视觉要求

- 参考图优先于开发者自己的审美。
- 不要擅自改成“普通 SaaS Dashboard”。
- 不要大量增加 KPI 卡片来替代组织协作信息。
- 不要把 CEO 工作台做成覆盖聊天的大型全屏弹窗。
- 保持聊天区域是视觉中心。
- 信息密度、留白、卡片圆角、字体层级、边框、阴影、颜色和导航比例应尽量贴近参考图。
- 保留 DSH 原有交互习惯，尽量微调，不要重写 DSH。

## 技术约束

- 基于现有 DSH/DSHBot。
- 不做大规模重写。
- 复用现有 Bot、Session、Chat、Main Bot、@Bot、Group Chat 能力。
- CompBotOrg organization layer 是增量能力。
- DSH runtime 仍然是 Bot 执行的 source of truth。
- 不要为了视觉重做后端。

## 当前实现说明

仓库当前已经有 organization graph、CEO prompt、sidebar 和 CEO Workspace 原型。
这些可以复用其中的业务逻辑，但**视觉和交互必须以参考图重新校准**。

特别是：

- `ds-bot/src/client/ceo-workspace.js`：当前只是原型，不是最终设计。
- `ds-bot/src/client/sidebar.js`：可以保留组织导航逻辑，但视觉应重新对齐参考图。
- `ds-bot/src/host/organization.js`：组织模型可以继续复用。
- `ds-bot/src/host/prompt.js`：CEO 行为原则可以继续复用。

## Definition of Done

完成后必须满足：

- 打开 CEO 时，第一视觉焦点仍然是 CEO Chat。
- 左侧可以理解整个组织。
- 中间可以看到 CEO 如何推动任务执行。
- 右侧可以查看组织上下文。
- 用户不需要学习复杂的项目管理软件。
- UI 看起来应该像参考图，而不是当前代码自己演化出来的另一套 Dashboard。
- 桌面端优先，同时不能破坏 DSH 原有布局。
