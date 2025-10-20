# Cortex Runtime

Cortex Runtime is a containerized agent framework that lets teams create, orchestrate, and observe modular AI teammates such as FinanceAgent, OutreachAgent, and FounderCore. This iteration focuses on a TypeScript/Node.js runtime with Supabase/Postgres storage and a React + Tailwind dashboard.

## Stack Overview

- **Node.js (Express + TypeScript)** API exposing agent CRUD, command console, task queue, and memory retrieval endpoints.
- **Postgres 15 + pgvector** backing store for agent metadata, tasks, and contextual memories.
- **Agent Manager & Coordinator** background service that continually polls for pending tasks, calls OpenAI GPT-5 (or deterministic fallback), and persists results back into the memory graph.
- **React + TypeScript Dashboard** featuring live agent grids, task queue insights, memory inspector, and slash-command console.
- **Docker Compose** definition covering Postgres, the Node server, React frontend, and nginx edge proxy.

## Requirements

- Docker 24+
- Docker Compose v2

## Quick start

```bash
docker compose up --build
```

Once the stack is running:

- REST API at http://localhost:4000 (proxied via http://localhost/api/)
- Frontend dashboard at http://localhost:3000 (or http://localhost via nginx)

## Running on macOS (fresh setup)

1. **Install prerequisites**
   - Install [Homebrew](https://brew.sh/) if you do not already have it: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
   - Install Docker Desktop: `brew install --cask docker`, then launch Docker Desktop and sign in so that the Docker engine is running.
   - (Optional for local development without containers) Install Node.js 20 LTS and pnpm: `brew install node@20 pnpm`.
2. **Clone the repository**
   ```bash
   git clone https://github.com/<your-org>/meta-agent-platform.git
   cd meta-agent-platform
   ```
3. **Create your environment file**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to set `OPENAI_API_KEY` (and any other secrets you need). The defaults already match the Docker Compose stack.
4. **Start the containers**
   ```bash
   docker compose up --build
   ```
   The first build can take a few minutes while Node and React dependencies install.
5. **Verify the services**
   - Navigate to http://localhost (nginx) or http://localhost:3000 (direct React app) for the dashboard.
   - Open http://localhost:4000/api/agents in your browser or via `curl` to confirm the API is serving requests.
6. **(Optional) Run services natively**
   - Start Postgres locally (Docker is still recommended) or point `DATABASE_URL` to an external instance.
   - Install server dependencies: `cd server && pnpm install` (or `npm install`), then `pnpm run dev`.
   - Install frontend dependencies: `cd frontend && pnpm install`, then `pnpm run dev` to launch Vite on http://localhost:5173.

Shut everything down with `docker compose down` when you are finished.

## Development

Environment variables are loaded from `.env`. The most important values are:

```
DATABASE_URL=postgres://postgres:postgres@db:5432/postgres
OPENAI_API_KEY=sk-...
FORCE_LOCAL=false   # optional: force all LLM calls to Ollama
FORCE_GPT=false     # optional: force all LLM calls to OpenAI GPT
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b
COORDINATOR_INTERVAL_MS=10000
REACT_APP_API_BASE=http://localhost:4000
VITE_API_BASE=http://localhost:4000
```

### Atlas Forge Integration

- **Meta Bridge Credentials** – Server-side agents that talk to Atlas Forge require `META_AGENT_SECRET` (already referenced in `.env`) and a valid JWT. Set `META_AGENT_JWT` (or `ATLAS_BRIDGE_TOKEN`) to the Supabase access token that should be used for bridge calls. Without it, the MetaCortex bus suppresses `/bridge-notify` fan-out.
- **HMAC Signing** – Requests to `https://lighdepncfhiecqllmod.supabase.co/functions/v1` now flow through the shared `AtlasBridgeClient`, which signs every call with `X-Agent-Id` and `X-Agent-Signature` (HMAC SHA-256 of `agentId + jwt`). Retry/backoff for `401/429` is built in and GET responses are cached for five minutes.
- **Built-in Atlas Agents** – The runtime ships specialised agents (`MemoryGraphAgent`, `TaskAgent`, `CalendarAgent`, `FinanceAgent`, `EmailMonitoringAgent`, `AISummarizerAgent`, `AnalyticsAgent`, and `MetaControllerAgent`) that automatically call their assigned Forge endpoints and collaborate via `request_context` / `context_response` bus events. Register them through the dashboard or CLI and provide per-agent bridge credentials under the new `bridge` configuration block.

### Dual-Model Router

The runtime now routes every LLM request through a lightweight router that chooses between the local Ollama **mistral:7b** model and OpenAI GPT. Short, low-complexity prompts are served locally, while heavier reasoning falls back to GPT. This hybrid strategy has been reducing paid token usage by **70–90%** in internal testing. Logs expose the selection and latency, e.g.:

```
[router] model=local time=186ms tokens≈42
[router] model=gpt time=912ms tokens≈128
```

Override behaviour by exporting `FORCE_LOCAL=true` or `FORCE_GPT=true` in `.env`. Streaming is supported on both backends, so existing token-by-token UIs continue to function.

## Services

- **db** – Postgres 15 with pgvector extension enabled
- **server** – Node/Express API with the coordinator loop
- **frontend** – React + TypeScript dashboard
- **forge** – Next.js authentication scaffold integrating Supabase/Atlas SSO (see `forge/README.md`)
- **nginx** – reverse proxy stitching `/api` to the server and `/` to the UI

## Agent Workflow

1. Create agents through the REST API, dashboard modal, or `/create` console command.
2. Submit tasks via `/agents/:id/task`, `/tasks/assign`, or the `/run` console command.
3. The coordinator loop resolves pending tasks, calls GPT-5 (or fallback text reasoning), executes `Agent.act`, and persists summaries + embeddings into `agent_memory`.
4. The dashboard polls the API to display live status, task throughput, and recent memory nodes for each agent.

## Slash Commands

The command console supports:

- `/create FinanceAgent with tools: Gmail, Notion`
- `/set goal "Manage invoices and alert overdue clients"`
- `/run FinanceAgent "Summarize this month's cash flow"`

Command responses appear in the console history and immediately update the dashboard.
