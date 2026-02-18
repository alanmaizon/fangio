# Fangio vs Amazon Bedrock AgentCore

A feature-by-feature comparison showing where Fangio stands today relative to [Amazon Bedrock AgentCore](https://github.com/awslabs/amazon-bedrock-agentcore-samples).

> Both projects aim to make AI agents production-ready, but they approach the problem differently.
> Fangio is a **lightweight, local-first trusted runtime** focused on safety and auditability.
> Bedrock AgentCore is a **managed cloud platform** focused on deploying and operating agents at scale.

---

## At a Glance

| Dimension | Fangio | Bedrock AgentCore |
|-----------|--------|-------------------|
| **Philosophy** | Trust through transparency | Scale through managed services |
| **Deployment** | Local-first, single-machine | AWS-managed, serverless |
| **Framework lock-in** | None — OpenAI-compatible API | None — works with Strands, LangGraph, CrewAI, etc. |
| **Model lock-in** | None — any OpenAI-compatible model | None — any model |
| **Primary language** | TypeScript | Python (SDK & CLI) |
| **License** | MIT | Apache 2.0 |

---

## Feature Matrix

✅ Implemented  ⚠️ Partial  🔲 Not yet implemented  — Not applicable

| Capability | Fangio | Bedrock AgentCore | Notes |
|------------|--------|-------------------|-------|
| **Runtime & Execution** | | | |
| Tool execution | ✅ | ✅ | Fangio uses direct process execution via `execa`; AgentCore provides serverless runtime |
| Sandboxed execution | 🔲 | ✅ | AgentCore runs in isolated containers; Fangio runs on host (sandboxing is a [future direction](../README.md#future-directions)) |
| Serverless deploy | 🔲 | ✅ | AgentCore deploys agents as managed serverless functions |
| Local development | ✅ | ✅ | Both support local dev; Fangio is local-first by design |
| **Planning & Safety** | | | |
| Structured planning | ✅ | — | Fangio enforces JSON-only plans from LLMs; AgentCore delegates planning to frameworks |
| Schema validation | ✅ | — | Zod contracts validate every plan before execution |
| Risk classification | ✅ | — | Three-tier risk system (low / medium / high) applied per tool |
| Approval gates | ✅ | — | Human-in-the-loop approval required for medium/high-risk steps |
| **Governance & Policy** | | | |
| Policy engine | 🔲 | ✅ | AgentCore uses Cedar policies for fine-grained access control; Fangio has risk tiers but no policy engine yet |
| RBAC / access control | 🔲 | ✅ | AgentCore integrates with IAM and identity providers |
| Tool-level governance | ⚠️ | ✅ | Fangio restricts execution to registered tools; AgentCore adds Cedar-based per-tool policies |
| **Observability** | | | |
| Audit event stream | ✅ | ✅ | Fangio emits 7 event types via SSE; AgentCore uses OpenTelemetry |
| Deterministic replay | ✅ | 🔲 | Fangio persists complete event timelines for offline replay |
| Distributed tracing | 🔲 | ✅ | AgentCore supports OpenTelemetry-compatible tracing |
| Operational dashboards | 🔲 | ✅ | AgentCore provides unified dashboards for monitoring agents |
| **Memory** | | | |
| Plan-scoped state | ✅ | ✅ | Fangio maintains in-memory plan state per execution |
| Multi-turn memory | 🔲 | ✅ | AgentCore provides managed short-term and long-term memory |
| Cross-session memory | 🔲 | ✅ | AgentCore supports persistent memory shared across agents |
| **Identity & Auth** | | | |
| Authentication | 🔲 | ✅ | AgentCore integrates with Cognito, Okta, Entra |
| Agent identity | 🔲 | ✅ | AgentCore provides identity and credential management for agents |
| Token vault | 🔲 | ✅ | AgentCore stores and rotates third-party tokens |
| **Tools & Integrations** | | | |
| Built-in tool catalog | ✅ | ✅ | Fangio: 7 tools (Docker, Git, filesystem, HTTP); AgentCore: Code Interpreter, Browser |
| Code interpreter | 🔲 | ✅ | AgentCore offers secure sandboxed code execution |
| Browser automation | 🔲 | ✅ | AgentCore provides managed headless browser for web tasks |
| MCP gateway | 🔲 | ✅ | AgentCore converts APIs and Lambda functions into MCP-compatible tools |
| Custom tool registration | ✅ | ✅ | Both support registering new tools |
| **Agent Evaluation** | | | |
| Quality evaluation | 🔲 | ✅ | AgentCore provides built-in and custom evaluators |
| Online monitoring | 🔲 | ✅ | AgentCore supports continuous production evaluation |
| **Multi-Agent** | | | |
| Multi-agent orchestration | 🔲 | ✅ | AgentCore supports agent-to-agent communication |
| Agent-to-agent protocol | 🔲 | ✅ | AgentCore supports A2A patterns |
| **Developer Experience** | | | |
| Web dashboard | ✅ | 🔲 | Fangio ships with a React UI for goals, plans, and timelines |
| CLI tooling | 🔲 | ✅ | AgentCore provides `agentcore` CLI for configure, launch, invoke |
| Demo / offline mode | ✅ | 🔲 | Fangio works offline with deterministic canned plans |
| Infrastructure as Code | 🔲 | ✅ | AgentCore provides CDK, CloudFormation, and Terraform templates |

---

## Where Fangio Leads

These are areas where Fangio's design provides capabilities that Bedrock AgentCore does not prioritize:

1. **Structured plan enforcement** — LLMs must output strict JSON plans that are schema-validated before any tool runs. The model plans; the runtime decides.

2. **Risk-tiered approval gates** — Every tool is classified by risk level. Medium and high-risk actions require explicit human approval before execution.

3. **Deterministic replay** — Complete audit timelines are persisted and can be replayed without calling the model again, enabling post-hoc analysis and debugging.

4. **Local-first privacy** — Sensitive data (logs, filesystem contents, repo state) never leaves the user's machine. No cloud dependency required.

5. **Interactive web dashboard** — A built-in React UI provides real-time visibility into goals, plans, approvals, and execution timelines.

6. **Offline / demo mode** — Fangio works without an API key using deterministic fallback plans, making demos and testing reliable.

---

## Where Bedrock AgentCore Leads

These are areas where Bedrock AgentCore provides capabilities Fangio has not yet implemented:

1. **Managed infrastructure** — Serverless runtime, auto-scaling, session isolation, and zero infrastructure management.

2. **Enterprise identity** — Integration with Cognito, Okta, Entra, and secure token vaults for third-party credentials.

3. **Cedar-based policy engine** — Fine-grained, deterministic access control using natural language or Cedar policy syntax.

4. **Persistent memory** — Managed short-term and long-term memory infrastructure shared across agents and sessions.

5. **Advanced tools** — Code Interpreter for sandboxed code execution and Browser Tool for headless web automation.

6. **MCP gateway** — Converts APIs and Lambda functions into MCP-compatible tools agents can discover and use.

7. **Observability at scale** — OpenTelemetry-compatible tracing, unified dashboards, and production monitoring.

8. **Agent evaluation** — Built-in evaluators for correctness, helpfulness, and safety with continuous online assessment.

9. **Multi-agent support** — Agent-to-agent communication and multi-agent collaboration patterns.

---

## Complementary, Not Competing

Fangio and Bedrock AgentCore serve different stages of the agent lifecycle:

| Stage | Fangio | Bedrock AgentCore |
|-------|--------|-------------------|
| **Prototyping** | ✅ Fast local setup, offline mode | ✅ CLI scaffolding |
| **Safety validation** | ✅ Schema enforcement, risk gates, approval | ⚠️ Policy engine (post-deploy) |
| **Production deploy** | 🔲 Local only | ✅ Managed serverless |
| **Operations at scale** | 🔲 Single machine | ✅ Auto-scaling, monitoring |
| **Post-incident analysis** | ✅ Deterministic replay | ⚠️ Trace-based debugging |

A potential integration path: use Fangio's safety layer (planning, validation, approval) as the governance frontend, deployed to Bedrock AgentCore's managed runtime for scale.

---

## Roadmap Alignment

Fangio's [future directions](../README.md#future-directions) directly address current gaps:

| Planned Feature | Closes Gap With |
|----------------|-----------------|
| Sandboxed tool execution | AgentCore Runtime isolation |
| Policy engines | AgentCore Policy (Cedar) |
| Multi-agent governance | AgentCore multi-agent support |
| Cryptographic execution signatures | Goes beyond AgentCore (unique to Fangio) |
| SOC2-aligned audit trails | Extends Fangio's existing replay advantage |
