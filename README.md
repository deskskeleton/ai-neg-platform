# AI Negotiation Experiment Platform

A self-hosted research platform for studying dyadic negotiation behavior with AI assistance. Built for controlled laboratory experiments on Maastricht University's DSRI (Data Science Research Infrastructure).

## Overview

This platform facilitates behavioral research experiments on negotiation with optional AI-powered coaching. It runs entirely on university infrastructure — no external cloud services required.

**Key features:**

- **Session management** — Researchers create and monitor negotiation sessions via admin dashboard
- **Participant flow** — Token-based entry → Pre-survey → Negotiation → Post-survey → Debrief
- **Real-time chat** — Live negotiation between paired participants (WebSocket)
- **Formal offer system** — Structured offer / accept / reject / counter-offer mechanics
- **AI assistant** — Rate-limited LLM coaching via self-hosted Ollama (configurable model)
- **Data collection** — Pre/post questionnaires (demographics, trust scales, NASA-TLX, SVI)
- **Experiment batches** — Pool-based runs with three rounds and shuffled scenario order; matchmaking pairs participants per round

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (React SPA)                                │
│  socket.io-client ←→ REST API (fetch)               │
└──────────────┬──────────────────────────┬───────────┘
               │                          │
       ┌───────▼───────┐          ┌───────▼───────┐
       │  App Server   │          │   Ollama      │
       │  Express +    │──────────│   LLM Server  │
       │  Socket.io    │  HTTP    │   (llama3.2)  │
       └───────┬───────┘          └───────────────┘
               │
       ┌───────▼───────┐
       │  PostgreSQL   │
       │  16           │
       └───────────────┘
```

All three services run as containers, deployable via Docker Compose (local) or OpenShift (DSRI).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS v4 |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL 16 |
| Realtime | PostgreSQL LISTEN/NOTIFY → Socket.io |
| LLM | Ollama (default: Llama 3.2) |
| Deployment | Docker, OpenShift (DSRI) |

## Prerequisites

- Node.js 20+
- Docker and Docker Compose (for local development)
- PostgreSQL 16 (or use the Docker Compose stack)
- Ollama (or use the Docker Compose stack)

## Quick Start (Local Development)

### 1. Clone and install

```bash
cd ai-neg-platform
npm install
cd server
npm install
cd ..
```

### 2. Environment setup

```bash
copy .env.example .env
copy server\.env.example server\.env
```

Edit `.env` and `server/.env` with your values. See `.env.example` for all available variables.

### 3. Start with Docker Compose

This brings up PostgreSQL, Ollama, and the app server:

```bash
docker compose up -d
```

The database is initialized automatically from `server/db/init.sql`.

### 4. Or run locally (without Docker)

Start the backend server:

```bash
cd server
npm run dev
```

Start the frontend dev server (in a separate terminal):

```bash
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to the backend on `http://localhost:3000`.

## Project Structure

```
ai-neg-platform/
├── src/                          # React frontend
│   ├── components/
│   │   ├── assistant/            # AI assistant panel
│   │   ├── chat/                 # Chat interface, timer, scenario info
│   │   ├── negotiation/          # Offer system (builder, display, payoffs)
│   │   ├── questionnaire/        # Survey components (Likert, slider, etc.)
│   │   └── layout/               # Error boundary
│   ├── config/
│   │   ├── scenarios.ts          # Negotiation scenarios and payoffs
│   │   ├── llm.ts                # LLM provider config
│   │   └── payoffs.ts            # Payoff matrices
│   ├── lib/
│   │   ├── data/                 # Data layer (REST adapter, types)
│   │   └── assistant/            # Assistant client (direct URL)
│   ├── pages/                    # All page components
│   └── types/                    # TypeScript database types
├── server/                       # Express backend
│   ├── src/
│   │   ├── routes/               # REST API endpoints
│   │   ├── middleware/            # Auth middleware
│   │   ├── db.ts                 # PostgreSQL connection pool
│   │   ├── realtime.ts           # LISTEN/NOTIFY → Socket.io
│   │   └── index.ts              # Server entry point
│   ├── db/
│   │   └── init.sql              # Full database schema
│   └── scripts/
│       └── backup.sh             # Database backup script
├── openshift/                    # DSRI deployment manifests
│   ├── app-deployment.yaml
│   ├── postgres-deployment.yaml
│   ├── ollama-deployment.yaml
│   └── DEPLOY.md                 # Step-by-step deployment guide
├── Dockerfile                    # Multi-stage build (frontend + server)
├── docker-compose.yml            # Local development stack
└── obsolete/                     # Historical docs from Supabase era
```

## Routes

| Path | Access | Description |
|------|--------|-------------|
| `/` | Public | Participant join page |
| `/admin` | Password | Researcher dashboard |
| `/join/:code` | Public | Join with session or batch code |
| `/p/:token` | Public | Pre-generated participant URL |
| `/pre-survey/:id` | Participant | Pre-negotiation questionnaire |
| `/round-lobby/:slotIndex` | Participant | Batch: wait for partner |
| `/briefing/:sessionId` | Participant | Role briefing + comprehension quiz |
| `/negotiate/:sessionId` | Participant | Main negotiation interface |
| `/post-survey/:id` | Participant | Post-negotiation questionnaire |
| `/debrief` | Participant | Study debrief + completion code |

## API Endpoints

The Express server exposes REST endpoints under `/api/`:

| Prefix | Purpose |
|--------|---------|
| `/api/participants` | Create, read, update participants |
| `/api/sessions` | Session lifecycle (create, join, start, end) |
| `/api/messages` | Chat messages and offers |
| `/api/events` | Event logging |
| `/api/assistant` | LLM query proxy (Ollama) |
| `/api/tokens` | Pre-generated participant tokens |
| `/api/surveys` | Survey completion tracking |
| `/api/batches` | Batch experiments and matchmaking |
| `/api/admin` | Admin-only session/batch management |

## Configuration

### Negotiation scenarios

Edit `src/config/scenarios.ts` to modify role names, issues, options, payoff matrices, and briefing text. Three canonical scenarios are included, each with identical point structures but different labels.

### LLM model

Edit `src/config/llm.ts` to change the default provider or model. The server-side model is configured via the `LLM_MODEL` environment variable (default: `llama3.2`).

### AI query limits

Set per-session in the admin dashboard when creating a session. `0` = unlimited.

## Deployment (DSRI)

See `openshift/DEPLOY.md` for step-by-step instructions to deploy on the university's DSRI OpenShift cluster. The deployment uses three pods:

1. **App server** — serves the React frontend and REST API
2. **PostgreSQL** — persistent data storage (Ceph PV)
3. **Ollama** — self-hosted LLM with persistent model storage

## Data Export

From the admin dashboard:

- **CSV** — export chat messages for a session
- **JSON** — full session export (session info, participants, messages, events, surveys)

For bulk export or backups, use `server/scripts/backup.sh` which runs `pg_dump` with 30-day retention.

## Experiment Batches

For pool-based runs (batch code entry, multiple participants): use an **even number** of participants per batch. Pairing is one-to-one each round; an odd count leaves one participant unmatched. Plan accordingly.

With 18 participants, the platform pre-seeds the round schedule when the 18th joins. Everyone is guaranteed a partner each round as long as all tabs reach the round lobby. If one tab is stuck waiting, the paired tab hasn't reached that round's lobby yet.

## Scripts

```bash
# Frontend
npm run dev        # Vite dev server (port 5173)
npm run build      # Production build
npm run typecheck  # TypeScript validation

# Server
cd server
npm run dev        # Express dev server with hot reload (port 3000)
npm run build      # Compile TypeScript
npm run start      # Run compiled server
```

## Security Notes

- Admin dashboard uses client-side password protection (sufficient for controlled lab on university network)
- All data stays on university infrastructure (DSRI / UM network)
- No external cloud services or API keys required
- Database backups are stored locally on UM storage

## License

Academic research use only. All rights reserved.
