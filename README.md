# CompBotOrg

> **AI Organization OS — chat with the CEO, not 30 Bots.**

CompBotOrg is built on top of DeepSeek Harness / DSHBot. It keeps DSHBot's proven Bot runtime, Sessions, memory, `@`/group collaboration, `message_bot`, `post_to_group`, and Main Bot capabilities, while adding an organization layer for departments, management relations, projects, delegation, and executive reporting.

## Product model

**老板 / Owner → CEO → 部门负责人 → 专家 Bot**

The human normally gives goals to the CEO. The CEO decomposes work, delegates to the existing DSHBot team primitives, monitors execution, coordinates specialists, reviews results, and reports back. The organization is a graph rather than a rigid tree: `manages`, `reports_to`, `member_of`, `collaborates`, `advisor_of`, `project_lead`, and `delegates_to` can coexist.

## Architecture

- **DSH / DSHBot** — agent runtime, sessions, Bot-to-Bot messaging, groups, memory, skills and existing web/desktop surface.
- **CompBotOrg organization layer** — lightweight persisted graph in `state.organization`; it does not replace the DSH roster.
- **CEO prompt** — upgrades the existing Main Bot into the organization's executive interface.
- **Channel API** — exposes organization state and mutation endpoints for a future organization workspace UI.

### Organization API operations

The host channel supports `organization`, `organization-department`, `organization-employee`, `organization-relation`, and `organization-project`. The actual Bot roster remains authoritative for execution.

## Development

```bash
cd ds-bot
npm ci
npm test
```

The upstream test suite currently expects additional DSH development dependencies from the monorepo; missing upstream packages can make a clean standalone clone report dependency failures. The CompBotOrg organization smoke test can be run directly:

```bash
node --test ds-bot/src/host/organization.test.js
```

## License

Apache-2.0 for the DSHBot-derived runtime. See upstream notices and third-party licenses in this repository.

## UI Design Reference

The UI must follow the original CompBotOrg design reference. The reference conversation is available here:

https://chatgpt.com/s/m_6af7cf7a460881919da8896d884a754c

See [`docs/COMPBOTORG_DESIGN_BRIEF.md`](docs/COMPBOTORG_DESIGN_BRIEF.md) and [`PROMPT_FOR_CODING_AGENT.md`](PROMPT_FOR_CODING_AGENT.md) before making frontend changes.


## 设计参考图

实现 UI 时以这张参考图为最高优先级：

[https://chatgpt.com/s/m_6af7cf7a460881919da8896d884a754c](https://chatgpt.com/s/m_6af7cf7a460881919da8896d884a754c)
