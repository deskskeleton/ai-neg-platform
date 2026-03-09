# AI Negotiation Experiment Platform

A research platform for studying dyadic negotiation behavior with AI assistance. Built for controlled laboratory experiments.

## Overview

This platform facilitates behavioral research experiments on negotiation with optional AI-powered coaching. Key features:

- **Session Management**: Researchers create and monitor negotiation sessions via admin dashboard
- **Participant Flow**: Token-based entry → Pre-Survey → Negotiation → Post-Survey → Debrief
- **Real-time Chat**: Live negotiation between paired participants
- **Formal Offer System**: Structured offer/accept/reject/counter-offer mechanics
- **AI Assistant**: Rate-limited AI coaching (configurable provider: Anthropic, OpenAI, local models)
- **Data Collection**: Pre/post questionnaires (demographics, trust scales, NASA-TLX, SVI)
- **Experiment Batches**: Pool-based runs (e.g. 20 participants) with three rounds and shuffled scenario order; matchmaking pairs participants per round

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime) |
| AI Backend | Supabase Edge Functions |
| AI Provider | Anthropic Claude (configurable) |
| Hosting | Vercel |

## Prerequisites

- Node.js 18+
- Supabase account
- Anthropic API key (or alternative LLM provider)
- Vercel account (for deployment)

## Quick Start

### 1. Install Dependencies

```bash
cd ai-neg-platform
npm install
```

### 2. Environment Setup

```bash
copy .env.example .env
```

Configure `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_PASSWORD=your-admin-password
```

### 3. Database Setup

Run migrations in Supabase SQL Editor (in order):

1. `supabase/migrations/001_initial_schema.sql` - Core tables
2. `supabase/migrations/002_lab_mode_rls.sql` - Permissive RLS for lab
3. `supabase/migrations/003_participant_tokens.sql` - Pre-generated URLs (optional)

### 4. Deploy AI Assistant (Edge Function)

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set ANTHROPIC_API_KEY=your-key
npx supabase functions deploy assistant --no-verify-jwt
```

### 5. Start Development

```bash
npm run dev
```

## Project Structure

```
ai-neg-platform/
├── src/
│   ├── components/
│   │   ├── assistant/      # AI assistant panel
│   │   ├── chat/           # Chat interface, timer, scenario info
│   │   ├── negotiation/    # Offer system components
│   │   └── questionnaire/  # Survey components (Likert, Slider, etc.)
│   ├── config/
│   │   ├── scenarios.ts    # Negotiation scenario configuration
│   │   └── llm.ts          # LLM provider configuration
│   ├── lib/
│   │   └── supabase.ts     # Database client and helpers
│   ├── pages/
│   │   ├── AdminPage.tsx       # Researcher dashboard
│   │   ├── JoinSessionPage.tsx # Participant entry (session or batch code)
│   │   ├── TokenEntryPage.tsx  # Pre-generated URL entry
│   │   ├── PreSurveyPage.tsx   # Demographics, trust scales
│   │   ├── RoundLobbyPage.tsx  # Batch: wait for round partner
│   │   ├── RoleBriefingPage.tsx# Role briefing before negotiation
│   │   ├── NegotiatePage.tsx   # Main negotiation interface
│   │   ├── PostSurveyPage.tsx  # NASA-TLX, SVI measures
│   │   └── DebriefPage.tsx     # Study information
│   └── types/
│       └── database.types.ts   # TypeScript definitions
├── supabase/
│   ├── migrations/         # SQL migration files
│   └── functions/
│       └── assistant/      # AI Edge Function
└── vercel.json             # Deployment configuration
```

## Routes

| Path | Access | Description |
|------|--------|-------------|
| `/` | Public | Participant join page |
| `/admin` | Password | Researcher dashboard |
| `/join/:code` | Public | Join with session or batch code |
| `/p/:token` | Public | Pre-generated participant URL |
| `/pre-survey/:id` | Participant | Pre-negotiation questionnaire |
| `/round-lobby/:slotIndex` | Participant | Batch: wait for partner (slot 1–3) |
| `/briefing/:sessionId` | Participant | Role briefing before negotiation |
| `/negotiate/:sessionId` | Participant | Negotiation interface |
| `/post-survey/:id` | Participant | Post-negotiation questionnaire |
| `/debrief` | Participant | Study debrief |

## Deployment

### Vercel (Frontend)

1. Import repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### Supabase (Backend)

Edge Functions are deployed separately:

```bash
npx supabase functions deploy assistant --no-verify-jwt
```

## Configuration

### Changing Scenarios

Edit `src/config/scenarios.ts` to modify:
- Role names and descriptions
- Negotiation issues and options
- Payoff matrices
- Briefing text

### Changing LLM Provider

Edit `src/config/llm.ts`:

```typescript
provider: 'anthropic',  // or 'openai', 'together', 'ollama'
```

## Data Export

Access data via Supabase Dashboard:

1. Go to Table Editor
2. Select table (messages, participants, etc.)
3. Export to CSV

Key tables:
- `messages` - All chat logs and offers
- `participants` - Survey responses (pre/post)
- `assistant_queries` - AI interaction logs
- `sessions` - Session metadata and outcomes

## Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run typecheck  # TypeScript validation
npm run preview    # Preview production build
```

## Experiment Batches

For pool-based runs (batch code entry, multiple participants): **use an even number of participants per batch** (2, 4, 6, … 20). Pairing is one-to-one each round; an odd number leaves one participant without a partner. Plan accordingly (e.g. cap at 18 if 19 show) and decide payment/compensation for anyone left out.

With 18 participants, the platform pre-seeds the round schedule when the 18th joins (who meets whom in Rounds A/B/C); everyone is guaranteed a partner each round as long as **all 18 tabs reach the round lobby**. If one tab stays on "Waiting for a partner for Round A/B/C…", the **other tab in that pair** has not yet reached that round’s lobby (e.g. still on the previous round or post-survey). Check that all 18 tabs have navigated to the same round (e.g. `/round-lobby/3?participant=…&batch=…` for Round C); once the missing tab reaches that lobby, both will match.

## Security Notes

- Admin dashboard uses client-side password protection (sufficient for controlled lab)
- RLS policies are permissive for anonymous lab participants
- API keys are stored as Supabase secrets, never exposed to frontend

## License

Academic research use only. All rights reserved.

## Documentation

- `DEVELOPMENT_LOG.md` - Development history and decisions
- `IMPLEMENTATION_STATUS.md` - Feature completion tracking
