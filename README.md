# Fangio
**A Trusted Runtime for Autonomous Agents**

> Plan → Approve → Execute → Replay

Fangio is a local-first runtime that makes AI agent actions **observable, governable, and replayable**, turning agent behavior into something developers can actually trust.

As agents become capable of executing real system tasks, the industry is rapidly asking:

*“Can agents be trusted?”*

Fangio answers that question.

---

## Why Fangio?

Today, most agent frameworks optimize for autonomy.

Few optimize for:

- execution safety  
- auditability  
- deterministic replay  
- human approval  
- capability governance  

Fangio introduces a runtime layer that enforces these properties by design.

**The model plans.  
The runtime decides.**

---

## Core Principles

### Local-First
Tool execution happens on the user’s machine.

Sensitive artifacts (logs, filesystem data, repo contents) never leave the runtime.

### Zero Trust Toward the Model
LLMs are treated as planners, not operators.

Every generated plan is:

- schema validated  
- tool-restricted  
- risk classified  
- approval gated  

### Deterministic Execution
Each run produces a complete audit timeline that can be replayed without calling the model again.

---

## How It Works

```

User Goal
↓
Planner (LLM)
↓
Structured Plan (JSON)
↓
Runtime Validation (zod)
↓
Approval Gate
↓
Tool Execution
↓
Audit Event Stream
↓
Replay Timeline

```

---

## Features

### Structured Planning
Agents must output strict JSON with no free-form reasoning controlling execution.

### Capability Registry
Tools are explicitly registered and risk-tiered.

Example:

| Tool | Risk |
|------|--------|
| docker.ps | low |
| http.probe | low |
| filesystem.search | low |
| docker.restart | medium |
| shell.run | high |

High-risk tools are blocked unless explicitly approved.

---

### Approval Before Action
Fangio surfaces agent intent **before execution**, enabling human-in-the-loop governance.

Example:

```

Restart container "api-prod"
Risk: Medium
Reason: Memory usage sustained at 96%

```

---

### Live Execution Timeline
Every step emits structured events:

- plan created  
- step approved  
- tool started  
- output received  
- step completed  

This creates full operational transparency.

---

### Replay Mode
Runs are persisted and can be replayed deterministically with no model required.

This introduces auditability typically missing from agent systems.

---

## Architecture

```

fangio/
├── apps/
│   ├── api        → Fastify agent runtime
│   └── web        → React dashboard
│
├── packages/
│   ├── schema     → zod safety contracts
│   ├── tools      → capability registry
│   └── planner    → LLM boundary
│
└── runs/          → persisted audit logs

````

### Stack

- **Full TypeScript**
- Fastify
- React + Vite
- zod
- execa
- Server-Sent Events (SSE)

No database required. Fangio is intentionally lightweight and local-first.

---

## Demo Scenario

**Goal:**  
Diagnose why a dockerized API is slow.

Fangio will:

✅ generate a structured diagnostic plan  
✅ classify tool risk  
✅ request approval for remediation  
✅ execute tools locally  
✅ stream outputs  
✅ persist the run  
✅ replay the timeline  

---

## Running Locally

### Requirements
- Node 18+
- pnpm
- Docker (optional but recommended)

---

### Install

```bash
pnpm install
````

---

### Start

```bash
pnpm dev
```

API:

```
http://localhost:3001
```

Web UI:

```
http://localhost:5173
```

---

## Deploy on Azure for Students

Fangio can be deployed with a simple split:

- `apps/api` on Azure App Service
- `apps/web` on Azure Static Web Apps

This repo includes deployment workflows:

- `.github/workflows/deploy-api-appservice.yml`
- `.github/workflows/deploy-web-static.yml`
- `.github/workflows/deploy-web-appservice.yml` (fallback when Static Web Apps is blocked by subscription policy)

### Fast setup (recommended)

```bash
pnpm azure:setup -- --set-github-secrets
```

This command:

- creates or reuses the Azure resource group
- creates App Service plan + API app
- creates Static Web App
- auto-retries alternative regions if your subscription blocks the default region
- auto-tries compatible Linux Node runtimes if one runtime string is rejected
- falls back to Web UI on App Service when Static Web Apps is policy-blocked
- sets API app settings (`NODE_ENV`, `CORS_ORIGINS`)
- writes required GitHub Actions secrets in your current repo

If you prefer manual secret setup, run:

```bash
pnpm azure:setup
```

Useful overrides:

```bash
pnpm azure:setup -- \
  --resource-group fangio-rg \
  --api-app-name fangio-api-demo \
  --web-app-name fangio-web-demo \
  --location eastus \
  --static-location centralus
```

Force App Service hosting for the web UI (skip Static Web Apps):

```bash
pnpm azure:setup -- --set-github-secrets --web-hosting appservice
```

### 1) Create Azure resources

Create:

- one **App Service** (Linux, Node 20) for the API
- one **Static Web App** for the web UI

### 2) Add GitHub repository secrets

In GitHub -> Settings -> Secrets and variables -> Actions, add:

- `AZURE_API_APP_NAME`: App Service name (example: `fangio-api`)
- `AZURE_API_PUBLISH_PROFILE`: publish profile XML from App Service -> Overview -> Get publish profile
- `VITE_API_URL`: public API URL (example: `https://fangio-api.azurewebsites.net`)

For Static Web Apps mode, also add:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`: deployment token from Static Web App -> Manage deployment token

For App Service web fallback mode, add instead:

- `AZURE_WEB_APP_NAME`
- `AZURE_WEB_PUBLISH_PROFILE`

### 3) Configure API environment variables

In App Service -> Environment variables, set:

- `NODE_ENV=production`
- `CORS_ORIGINS=https://<your-web-host>`
- `GITHUB_TOKEN` or `LLM_API_KEY` (depending on your model provider)
- optional `LLM_MODEL` and `LLM_BASE_URL`

Do not hardcode `PORT`; App Service injects it automatically.

### 4) Deploy

Push to `main` or run each workflow manually from GitHub Actions.

- Static Web Apps mode: run `deploy-web-static.yml`
- App Service web mode: run `deploy-web-appservice.yml`

### 5) Share for testing

Share your web URL with testers (either `azurestaticapps.net` or `azurewebsites.net`).

Flow for testers:

- open the web URL
- create and approve plans in UI
- UI calls your API at `VITE_API_URL`
- API allows requests only from `CORS_ORIGINS`

Quick health check:

```bash
curl https://<your-api>.azurewebsites.net/health
```

If that returns `{"status":"ok"}`, the runtime is reachable.

---

## Foundry Adoption Doctor

Fangio includes a validator to spot high-risk adoption gaps before production rollout:

- channel parity drift (playground vs activity protocol vs Copilot Studio)
- MCP schema drift (`custom_MCP` vs `mcp`)
- region/network readiness risks
- trace correlation field completeness in replay logs

### Quick Start

```bash
cp foundry.doctor.example.json foundry.doctor.json
pnpm doctor:foundry
pnpm doctor:foundry -- --json
pnpm doctor:foundry -- --strict
```

### Optional Env Controls

```bash
FANGIO_REQUIRE_PRIVATE_NETWORK=true
FANGIO_FOUNDRY_REGION_RISK_DENYLIST=westeurope
FANGIO_DATA_DIR=.fangio
```

The command exits with code `1` when any check fails.
In `--strict` mode (or `FANGIO_DOCTOR_STRICT=true`), warnings also fail the run for CI gating.

---

## Using GitHub Models

Fangio uses [GitHub Models](https://github.com/marketplace/models) as its default LLM provider. This means you can power Fangio with AI models directly from GitHub with no separate API key needed.

### Setup

1. **Create a GitHub Personal Access Token** at [github.com/settings/tokens](https://github.com/settings/tokens)
2. **Set it in your `.env` file:**

```
GITHUB_TOKEN=ghp_your_token_here
```

3. **That's it!** Fangio will automatically use GitHub Models at `https://models.github.ai/inference`

### Switching Models

You can use any model available in [GitHub Models](https://github.com/marketplace/models):

```
LLM_MODEL=openai/gpt-4o-mini      # Default - fast and cost-effective
LLM_MODEL=openai/gpt-4o           # More capable
```

### Testing Prompts in the Playground

This repository includes `.prompt.md` files in `.github/prompts/` that you can test directly in the GitHub Models playground:

1. Enable **Models** on this repository (Settings → Models → Enabled)
2. Go to the **Models** tab
3. Select a prompt file and experiment with different models

### Using Other Providers

Fangio works with any OpenAI-compatible API. To use a different provider:

```
LLM_API_KEY=sk-your-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

---

## API Key (Optional)

Fangio supports two modes:

### Smart Mode

Uses an LLM to generate plans.

```
LLM_API_KEY=your_key_here
```

### Demo Mode

If no key is present, Fangio falls back to deterministic canned plans, ensuring reliable demos even offline.

---

## API Reference

### POST /api/plan

Create a new execution plan from a user goal.

**Request:**
```json
{
  "goal": "Diagnose why my dockerized API is slow"
}
```

**Response:**
```json
{
  "planId": "plan-1234567890",
  "plan": {
    "planId": "plan-1234567890",
    "goal": "Diagnose why my dockerized API is slow",
    "steps": [
      {
        "id": "step-1",
        "tool": "docker.ps",
        "args": {},
        "risk": "low",
        "description": "List all running containers",
        "approved": true
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### POST /api/approve

Approve medium/high-risk steps before execution.

**Request:**
```json
{
  "planId": "plan-1234567890",
  "stepIds": ["step-2", "step-3"]
}
```

**Response:**
```json
{
  "ok": true
}
```

### POST /api/execute

Execute an approved plan.

**Request:**
```json
{
  "planId": "plan-1234567890"
}
```

**Response:**
```json
{
  "ok": true
}
```

Returns 400 if not all steps are approved.

### GET /api/events?planId=...

Server-Sent Events (SSE) stream of execution events.

**Stream Format:**
```
data: {"planId":"plan-123","type":"step.started","stepId":"step-1","timestamp":"2024-01-01T00:00:00.000Z"}

data: {"planId":"plan-123","type":"step.output","stepId":"step-1","data":{"stdout":"..."},"timestamp":"2024-01-01T00:00:01.000Z"}
```

**Event Types:**
- `plan.created` - Plan was created
- `step.approved` - Step was approved
- `step.started` - Step execution started
- `step.output` - Step produced output
- `step.error` - Step encountered an error
- `step.finished` - Step execution finished
- `execution.finished` - All steps completed

### GET /api/replay?planId=...

Get the complete event log for a plan (for replay).

**Response:**
```json
{
  "events": [
    {
      "planId": "plan-123",
      "type": "plan.created",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## Tool Catalog

All available tools with their risk classifications:

| Tool | Risk | Description | Arguments |
|------|------|-------------|-----------|
| `docker.ps` | low | List all running Docker containers | None |
| `docker.stats` | low | Get resource usage statistics for containers | None |
| `docker.logs` | low | Get the last 100 lines of container logs | `container` (string) |
| `docker.restart` | medium | Restart a Docker container | `container` (string) |
| `git.status` | low | Get Git repository status | None |
| `filesystem.search` | low | Search for files matching a pattern | `path` (string), `pattern` (string) |
| `http.probe` | low | Probe an HTTP endpoint for status and response time | `url` (string) |

### Risk Policy

- **Low risk** - Auto-approved, executed immediately
- **Medium risk** - Requires explicit approval before execution
- **High risk** - Blocked unless explicitly approved (not currently in catalog)

---

## Design Philosophy

Fangio is intentionally **not**:

* another chatbot
* an autonomous black box
* a prompt wrapper

Instead, it treats agents as **production infrastructure** that must be observable and controllable.

---

## Future Directions

* sandboxed tool execution
* policy engines
* multi-agent governance
* cryptographic execution signatures
* SOC2-aligned audit trails

---

## Inspiration

Named after **Juan Manuel Fangio**, one of the most precise drivers in Formula 1 history, this project reflects the same philosophy:

> Power is meaningless without control.

---

## License

MIT
