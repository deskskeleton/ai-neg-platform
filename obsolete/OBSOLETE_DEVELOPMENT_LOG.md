# Development Log - AI Negotiation Experiment Platform

> This document tracks development progress and decisions to maintain continuity across sessions.

---

## Project Overview

**Purpose:** Dyadic negotiation experiment platform for PhD research  
**Stack:** React + TypeScript + Vite + Tailwind CSS v4 + Supabase + Anthropic API  
**Started:** January 14, 2026

---

## Spec implementation (multi-round, payoffs, completion code) – March 2026

Implemented per specification vs implementation plan:

- **Data layer & assistant abstraction:** `src/lib/data/` (interfaces + Supabase adapter); `src/lib/assistant/` (IAssistantClient, Supabase + direct-URL). App imports from `@/lib/data`; set `VITE_ASSISTANT_API_URL` for local model.
- **Data model:** Migrations 006–008: `sessions.dyad_id`, `sessions.round_number`; `session_participants.treatment_condition`; `participants.completion_code`; `event_log.round_id`, `event_log.dyad_id`; `round_queue` table; `try_match_round` RPC for matchmaking.
- **Payoffs:** `src/config/payoffs.ts` with v1.a, v1.b, v1.c (4×3 A/B matrices); `getScenarioForRoundPayoff()` in scenarios; round sessions use scenario v1.a/v1.b/v1.c.
- **Round loop:** `/round-lobby/:roundNumber` (RoundLobbyPage); matchmaking pairs distinct opponents per round; flow: pre-survey (both) → “Start 3-round experiment” → round 1 lobby → briefing → negotiate → post-survey (with `round` param) → round 2 lobby → … → round 3 → post-survey → debrief. PostSurveyPage redirects to next round lobby or debrief based on `round` query.
- **A/B treatment:** `PayoffReference` accepts `treatmentCondition`: `payoff_always_visible` (table always open) vs `payoff_collapsible`. Matchmaking assigns one role always_visible, one collapsible.
- **Completion code:** `generateCompletionCode(participantId)`; DebriefPage shows and copies completion code for BEELab.

Pre-survey remains after consent and (in join flow) after both participants are matched; round queue is entered after pre-survey. Optional future change: pre-survey before any matching (solo then round lobby).

---

## Session 1 - January 14, 2026

### Completed Tasks

#### 1. Project Initialization
- [x] Created Vite + React + TypeScript project
- [x] Installed all dependencies:
  - `@supabase/supabase-js` - Database & realtime
  - `@anthropic-ai/sdk` - AI assistant
  - `react-router-dom` - Routing
  - `@tanstack/react-query` - Data fetching
  - `react-hook-form` + `zod` - Form handling
  - `date-fns` - Date utilities
  - `lucide-react` - Icons
  - `@hookform/resolvers` - Zod integration

#### 2. Configuration
- [x] Tailwind CSS v4 with custom theme (primary blue, neutral slate)
- [x] TypeScript strict mode with path aliases (`@/`)
- [x] React Router with all routes configured
- [x] Environment variables setup (`.env.example` created)

#### 3. Database Schema
- [x] Created `supabase/migrations/001_initial_schema.sql` with tables:
  - `participants` - User info and survey data
  - `sessions` - Negotiation session metadata
  - `session_participants` - Links participants to sessions with roles
  - `messages` - Chat messages
  - `assistant_queries` - AI interaction logs
  - `event_log` - Behavioral tracking
  - `negotiation_outcomes` - Computed metrics
- [x] Row Level Security (RLS) policies
- [x] Indexes for performance
- [x] Helper functions (`generate_session_code`, `create_session`)
- [x] Realtime enabled for messages, sessions, session_participants

#### 4. Supabase Client (`src/lib/supabase.ts`)
- [x] Client initialization with graceful handling of missing credentials
- [x] Helper functions:
  - Participant: `createParticipant`, `getParticipant`, `updateParticipant`
  - Session: `createSession`, `getSession`, `joinSession`, `startSession`, `endSession`
  - Messages: `sendMessage`, `sendOffer`, `getSessionMessages`
  - Realtime: `subscribeToMessages`, `subscribeToSession`, `subscribeToParticipants`
  - Events: `logEvent`, `logEvents`, `getSessionEvents`
  - Assistant: `logAssistantQuery`, `getAssistantQueries`

#### 5. Core Pages
- [x] `AdminPage.tsx` - Session management dashboard
  - Create new sessions with auto-generated 6-char codes
  - List all sessions with status, participants, scenario
  - Start/end/delete session actions
  - Copy join link functionality
  - Stats overview (active, completed, total participants)
  
- [x] `JoinSessionPage.tsx` - Participant entry flow
  - Session code validation (URL param or manual entry)
  - Participant info form (name, email, consent)
  - Auto role assignment (PM or Developer)
  - Waiting room with realtime updates
  - Ready state when both participants joined

#### 6. Routes Configured
| Route | Page | Status |
|-------|------|--------|
| `/` | AdminPage | ✅ Complete |
| `/join` | JoinSessionPage | ✅ Complete |
| `/join/:code` | JoinSessionPage | ✅ Complete |
| `/pre-survey/:participantId` | PreSurveyPage | 🔲 Placeholder |
| `/negotiate/:sessionId` | NegotiatePage | 🔲 Placeholder |
| `/post-survey/:participantId` | PostSurveyPage | 🔲 Placeholder |
| `/debrief` | DebriefPage | 🔲 Placeholder |

### Files Created/Modified
```
ai-neg-platform/
├── .env.example
├── .gitignore
├── README.md
├── DEVELOPMENT_LOG.md (this file)
├── index.html
├── package.json
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── vite-env.d.ts
    ├── lib/
    │   └── supabase.ts
    ├── types/
    │   └── database.types.ts
    └── pages/
        ├── AdminPage.tsx
        ├── JoinSessionPage.tsx
        ├── PreSurveyPage.tsx (placeholder)
        ├── NegotiatePage.tsx (placeholder)
        ├── PostSurveyPage.tsx (placeholder)
        └── DebriefPage.tsx (placeholder)
```

---

## Things to Review/Change Later

### UI/UX Improvements
- [ ] **Duplicate "Create Session" buttons** - Header has "New Session", empty state has "Create Session". Consider removing one for cleaner UX.
- [ ] Consider adding a loading skeleton instead of spinner for better perceived performance
- [ ] Mobile responsiveness testing needed (low priority for lab)
- [x] ~~Add confirmation dialogs for destructive actions~~ (added for delete, remove participant)

### Technical Debt
- [ ] **Chunk size warning** - Build produces >500KB bundle. Consider code splitting with dynamic imports.
- [ ] `zodResolver as any` type cast - Zod v4 has type incompatibility with react-hook-form resolvers. Monitor for updates.
- [ ] Add proper error boundaries for React error handling
- [ ] Consider adding retry logic for failed Supabase operations

### Security Considerations
- [x] ~~Admin authentication~~ - Password protection added
- [ ] **Admin password is client-side only** - Not truly secure, but sufficient for controlled lab. Consider server-side auth for production.
- [ ] Review what data is exposed to participants vs researchers
- [ ] Rate limiting for session creation (low priority for lab)

### Features to Implement
- [ ] **AI assistant integration with Anthropic API** ← Next priority
- [ ] Pre-survey questionnaire (demographics, personality measures)
- [ ] Post-survey questionnaire
- [ ] Debrief page content
- [ ] Offer submission/acceptance flow (formal agreement mechanism)
- [ ] Export data functionality for researchers (CSV/JSON download)
- [ ] Session end handling (what happens when timer runs out?)
- [x] ~~Main negotiation chat interface~~ - Basic version done
- [x] ~~Session timer functionality~~ - Basic countdown done
- [x] ~~Admin authentication~~ - Password gate added

### Potential Issues Discovered
- [ ] **Orphaned participants** - Users who join then leave/error create orphaned records. Manual cleanup via admin panel works but could automate with heartbeat/timeout.
- [ ] **Form validation UX** - Need to test what happens with incomplete/invalid form submissions more thoroughly.
- [ ] **Session state edge cases** - What if participant refreshes during waiting room? Currently may create duplicate entries.
- [ ] **Timer sync** - Each participant has independent timer. Should sync from server `started_at` time.

### Testing Needed
- [ ] Test full dyad flow with two browser windows
- [ ] Test realtime subscriptions under various network conditions
- [ ] Test session state transitions (waiting → active → completed)
- [ ] Load testing with multiple concurrent sessions (5 dyads)

---

## Architecture Decisions

### Why These Choices?

1. **Vite over CRA**: Faster builds, better DX, native ESM support
2. **Tailwind v4**: Latest version with CSS-based config, better performance
3. **Supabase**: PostgreSQL + Realtime + Auth in one platform, good for research
4. **TanStack Query**: Robust data fetching with caching, good for realtime updates
5. **Zod + React Hook Form**: Type-safe validation with good DX
6. **6-char session codes**: Balance between uniqueness and usability

### Data Flow

```
Participant A                    Supabase                    Participant B
     │                              │                              │
     ├──── Join Session ───────────►│                              │
     │                              │◄───────── Join Session ──────┤
     │                              │                              │
     │◄─── Realtime: Partner ───────┤────── Realtime: Partner ────►│
     │         Joined               │           Joined             │
     │                              │                              │
     ├──── Send Message ───────────►│                              │
     │                              │◄───── Realtime: New Msg ─────┤
     │◄─── Realtime: New Msg ───────┤                              │
```

---

## Environment Setup

### Required Environment Variables
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ANTHROPIC_API_KEY=sk-ant-...  # For AI assistant (not yet implemented)
VITE_ADMIN_PASSWORD=your-secret   # Admin dashboard password (defaults to 'admin')
```

### Supabase Setup
1. Create project at supabase.com
2. Run migration: `supabase/migrations/001_initial_schema.sql`
3. Copy URL and anon key to `.env`

### Development Commands
```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run typecheck # TypeScript check
npm run preview  # Preview production build
```

---

## Session 2 - January 14, 2026 (Continued)

### Completed Tasks

#### 7. Lab Mode RLS Fix
- [x] Created `002_lab_mode_rls.sql` migration
  - Drops restrictive RLS policies that required `auth.uid()`
  - Creates permissive policies for controlled lab environment
  - Fixes: `createParticipant failed: new row violates row-level security policy`

#### 8. Simplified Join Flow for Lab Settings
- [x] Refactored `JoinSessionPage.tsx` for lab use:
  - Removed name/email form (not needed in controlled lab)
  - Auto-creates anonymous participant on join
  - Simple consent checkbox
  - Cleaner state machine: `code_entry` → `consent` → `waiting_room` → `ready`
  - Demographics will be collected in pre-survey instead

#### 9. Real-time Negotiation Chat Interface
- [x] `NegotiatePage.tsx` - Two-column layout
  - 70% chat interface, 30% assistant panel (placeholder)
  - Scenario info header with role-specific information
  - Countdown timer component
  
- [x] `ChatInterface.tsx` - Chat component
  - Real-time message subscription via Supabase
  - Auto-scroll to newest messages
  - Own vs opponent message styling
  - Sender role badges (PM/Developer)
  - Timestamps for each message
  - Enter to send, Shift+Enter for new line
  
- [x] `NegotiationTimer.tsx` - Countdown timer
  - Configurable time limit (default 20 minutes)
  - Visual warning when < 2 minutes remaining
  
- [x] `ScenarioInfo.tsx` - Role-specific negotiation details

#### 10. Pre-generated Participant URLs (Lab Mode)
- [x] Created `003_participant_tokens.sql` migration
  - `participant_tokens` table for pre-generated entry URLs
  - `generate_participant_token()` function for 5-char codes
  - `create_token_batch()` function to generate PM + Developer tokens
  - Terminal number field for lab assignment
  
- [x] `TokenEntryPage.tsx` - Direct URL entry for participants
  - Handles `/p/{token}` route
  - Qualtrics redirect support (`?from=qualtrics&rid={id}`)
  - Skip pre-survey option (`?skip=presurvey`)
  
- [x] Updated `AdminPage.tsx`
  - "Generate URLs" button (link icon) on session rows
  - Modal to view/copy/print participant URLs
  - Print-friendly layout for instruction sheets

### Files Created This Session
```
supabase/migrations/
├── 002_lab_mode_rls.sql          # Permissive RLS for lab mode
└── 003_participant_tokens.sql    # Pre-generated URLs

src/components/chat/
├── ChatInterface.tsx             # Real-time chat UI
├── NegotiationTimer.tsx          # Countdown timer
└── ScenarioInfo.tsx              # Scenario display

src/pages/
├── NegotiatePage.tsx             # Main negotiation page (updated)
├── JoinSessionPage.tsx           # Simplified for lab mode (updated)
└── TokenEntryPage.tsx            # Pre-generated URL entry (NEW)

src/types/
└── database.types.ts             # Added participant_tokens table

src/lib/
└── supabase.ts                   # Added token functions
```

#### 11. Participant Management
- [x] Clickable participant count in session table
- [x] Modal to view participants with role & join time
- [x] Remove individual participant button
- [x] "Clear All" button to reset session participants
- [x] Fixes orphaned participants when users leave/error out

#### 12. Admin Access Control
- [x] Moved admin dashboard from `/` to `/admin`
- [x] Password protection using `VITE_ADMIN_PASSWORD` env variable
- [x] Session-based auth (persists until tab closed)
- [x] Root `/` now shows participant join page

### Updated Routes
| Route | Purpose | Access |
|-------|---------|--------|
| `/` | Participant join page | Public |
| `/admin` | Session management dashboard | **Password protected** |
| `/join/:code` | Direct join with code | Public |
| `/p/:token` | Pre-generated URL entry | Public |

### Migrations to Run (in order)
1. `001_initial_schema.sql` - Base tables
2. `002_lab_mode_rls.sql` - Permissive RLS for lab mode
3. `003_participant_tokens.sql` - Pre-generated URLs (optional)

---

## Next Session Priorities

1. **Build AI assistant panel** - Anthropic API integration
2. **Build PreSurveyPage** with demographics questionnaire  
3. **Build PostSurveyPage** with outcome measures
4. **Add offer/acceptance flow** for formal agreements
5. **Test full dyad flow** with two browsers end-to-end

---

## ⚠️ Potential Over-Engineering Notes

### Flexible Participant Entry System (Session 2)
**Added:** Pre-generated participant tokens with Qualtrics redirect support

**Why it might be over-engineered:**
- BEELab requirements still uncertain
- Simple session code entry might be sufficient
- Qualtrics integration may not be needed

**How to revert if unneeded:**
1. Delete `/p/:token` route from `App.tsx`
2. Revert `JoinSessionPage.tsx` to simple code entry
3. Remove `generateParticipantBatch` from `supabase.ts`
4. Drop `participant_tokens` table if created

**Keep if:** BEELab requires Qualtrics integration OR pre-generated URLs prove useful for lab logistics.

---

## Notes for Future Sessions

### Quick Reference
- **Admin URL:** `/admin` (password protected)
- **Participant URL:** `/join/CODE` or `/p/TOKEN`
- **Roles:** PM (Project Manager) and Developer
- **Session codes:** 6 chars, uppercase alphanumeric (no 0/O, 1/I confusion)

### Architecture Notes
- Realtime enabled for: `messages`, `sessions`, `session_participants`
- Supabase client handles missing credentials gracefully
- Tailwind v4 uses `@theme` and `@import "tailwindcss"` syntax
- Password auth is client-side (sessionStorage) - sufficient for lab, not production

### BEELab Integration (TBD)
- May need Qualtrics integration for surveys
- Pre-generated URLs ready (`/p/:token`) with Qualtrics redirect support
- Terminal assignment field available in token system
- Discuss with BEELab: survey ownership, data export format, ORSEE integration

---

## Session 3 - January 15, 2026

### Completed Tasks

#### 13. Modular Scenario Configuration
- [x] Created `src/config/scenarios.ts` - Centralized scenario configuration
  - Role definitions (PM, Developer) with labels and colors
  - Negotiation issues (deadline, budget, scope, testing) with options and payoffs
  - Role-specific briefings with confidential information
  - UI text configuration for easy localization
  - Helper functions: `getRoleByDatabaseId`, `calculatePoints`, `calculateJointGain`, `formatAgreement`
- [x] All scenario-specific text now in ONE place for easy changes

#### 14. Questionnaire Components
- [x] Created reusable survey components in `components/questionnaire/`:
  - `LikertScale.tsx` - 7-point scale with radio buttons
  - `QuestionSection.tsx` - Styled section container
  - `ProgressBar.tsx` - Multi-section progress indicator
  - `SliderScale.tsx` - For 21-point scales (NASA-TLX)
  - `TextInput.tsx` - Text and number inputs
  - `SelectInput.tsx` - Dropdown select
  - `RadioGroup.tsx` - Categorical radio choices

#### 15. Pre-Survey Implementation
- [x] Rebuilt `PreSurveyPage.tsx` with actual survey questions:
  - Section 1: Demographics (age, gender, field of study)
  - Section 2: Machine Trust Propensity (6 items, reverse scoring noted)
  - Section 3: Expected Trust in AI Assistant (3 items)
  - Section 4: Experience (negotiation, AI tools)
- [x] Form validation with react-hook-form + zod
- [x] Data saved to `participants.pre_questionnaire_data` as JSONB
- [x] Redirects to waiting room after completion

#### 16. Survey-First Flow Update
- [x] Updated participant flow: Survey BEFORE matching (during briefing)
- [x] TokenEntryPage now redirects to PreSurvey immediately after consent
- [x] JoinSessionPage updated to handle post-survey redirect
- [x] JoinSessionPage now navigates to `/negotiate` (not pre-survey)

**New Flow:**
```
Token URL → Consent → Pre-Survey → Waiting Room → Negotiate → Post-Survey → Debrief
```

#### 17. Offer System Components
- [x] Created negotiation components in `components/negotiation/`:
  - `OfferBuilder.tsx` - UI to select options for each issue
  - `OfferDisplay.tsx` - Display offers with accept/reject/counter buttons
  - `AgreementBanner.tsx` - Shows final agreement with points
  - `OfferPanel.tsx` - Container managing offer flow state

### Files Created This Session
```
src/config/
├── scenarios.ts              # Centralized scenario configuration
└── index.ts                  # Config exports

src/components/questionnaire/
├── LikertScale.tsx           # 7-point Likert scale
├── QuestionSection.tsx       # Section container
├── ProgressBar.tsx           # Survey progress
├── SliderScale.tsx           # Slider for 21-point scales
├── TextInput.tsx             # Text/number input
├── SelectInput.tsx           # Dropdown select
├── RadioGroup.tsx            # Radio button group
└── index.ts                  # Barrel exports

src/components/negotiation/
├── OfferBuilder.tsx          # Build offers by selecting options
├── OfferDisplay.tsx          # Display offers with actions
├── AgreementBanner.tsx       # Final agreement display
├── OfferPanel.tsx            # Offer flow container
└── index.ts                  # Barrel exports

src/pages/
├── PreSurveyPage.tsx         # Full implementation (updated)
├── JoinSessionPage.tsx       # Survey-first flow (updated)
└── TokenEntryPage.tsx        # Direct to survey (updated)
```

### Design Decisions Made

#### Survey Timing: BEFORE Matching
**Rationale:**
- Lab briefing is a natural checkpoint
- Participants complete survey during briefing, not rushed
- Experimenter can verify all surveys before matching
- Trust measures untainted by waiting room anxiety

#### Modular Scenario Configuration
**Rationale:**
- Scenario text (roles, issues, payoffs) may change
- One file to edit = less risk of inconsistencies
- Supports A/B testing with different scenarios
- Non-coder can edit text without understanding React

#### Formal Offer System
**Rationale:**
- Logrolling problem has discrete issues/options
- Need structured offers (not just chat)
- Accept/Reject/Counter provides clear negotiation mechanics
- Enables automatic point calculation

### Remaining Tasks

#### Still Pending (from original plan):
1. **Integrate offer system into NegotiatePage** - Wire up OfferPanel to chat
2. **AI Assistant (Prompt 5)** - Supabase Edge Functions + Anthropic API
3. **Post-Survey (Prompt 7)** - NASA-TLX, Subjective Value Inventory
4. **Debrief Page** - Thank you, study explanation
5. **Logging System (Prompt 8)** - Event enum, integrate throughout
6. **Data Export (Prompt 9)** - CSV downloads
7. **Polish (Prompt 10)** - Error boundaries, toasts, accessibility
8. **Deployment (Prompt 11)** - Vercel config

#### Architecture Decision Pending:
- **AI Assistant Backend**: Supabase Edge Functions recommended
- Need to implement before full testing

### Quick Reference - New Components

#### Using Scenario Config
```typescript
import { SCENARIO_CONFIG, getRoleByDatabaseId, calculatePoints } from '@/config/scenarios';

// Get role info
const role = getRoleByDatabaseId('pm'); // { id: 'pm', label: 'Project Manager', ... }

// Calculate points for agreement
const points = calculatePoints(agreement, 'roleA');
```

#### Using Questionnaire Components
```typescript
import { LikertScale, QuestionSection, ProgressBar } from '@/components/questionnaire';

<LikertScale
  question="How much do you agree?"
  min={1}
  max={7}
  minLabel="Strongly Disagree"
  maxLabel="Strongly Agree"
  value={value}
  onChange={setValue}
  required
/>
```

#### Using Offer Components
```typescript
import { OfferPanel, OfferBuilder, OfferDisplay } from '@/components/negotiation';

<OfferPanel
  participantId={id}
  participantRole={role}
  pendingOffer={offer}
  agreement={agreement}
  onMakeOffer={handleMakeOffer}
  onAcceptOffer={handleAccept}
  onRejectOffer={handleReject}
/>
```

---

---

## Session 4 - January 15, 2026 (Continued)

### Completed Tasks

#### 18. Multi-Provider LLM Configuration
- [x] Created `src/config/llm.ts` - Provider-agnostic AI configuration
  - Supports Anthropic (Claude Sonnet), OpenAI (GPT-4o Mini), Together AI (Llama 3)
  - Easy provider switching: just change `LLM_CONFIG.provider`
  - Configurable max tokens, temperature, rate limits
  - System prompt for negotiation context

#### 19. Supabase Edge Function for AI Assistant
- [x] Created `supabase/functions/assistant/index.ts`
  - CORS handling for browser requests
  - Multi-provider implementation (Anthropic, OpenAI, Together)
  - Rate limiting (20 queries per participant per session)
  - Conversation history for context
  - Automatic logging to `assistant_queries` table
  - Event logging for research

#### 20. AssistantPanel Component
- [x] Created `src/components/assistant/AssistantPanel.tsx`
  - Query input with Enter to send
  - Conversation history display
  - Rate limiting UI (queries remaining badge)
  - Copy response to clipboard
  - Loading states
  - Error handling for rate limits
  - Loads existing queries on mount
- [x] Integrated into NegotiatePage

#### 21. Offer System Integration
- [x] Connected OfferPanel to NegotiatePage
  - Make/Accept/Reject offer flows
  - Messages stored with `message_type: 'offer'|'acceptance'|'rejection'`
  - Offer data stored in message `metadata`
  - Agreement state tracked
  - Points calculated on acceptance

#### 22. Post-Survey Implementation
- [x] Rebuilt `PostSurveyPage.tsx` with full measures:
  - Section 1: NASA-TLX Workload (mental demand, effort) - 21-point sliders
  - Section 2: SVI Instrumental (satisfaction, balance, forfeit, legitimacy)
  - Section 3: SVI Relationship (strengthened, respected, willing again, constructive) + comprehension check
  - Section 4: Open feedback
- [x] Form validation with zod
- [x] Saves to `participants.post_questionnaire_data`
- [x] Reverse scoring noted for forfeit item

#### 23. Debrief Page Implementation
- [x] Rebuilt `DebriefPage.tsx` with full content:
  - Thank you header
  - Study purpose and research questions
  - Payment information (BEELab specific)
  - Data privacy notice
  - Contact information
  - "Don't discuss" reminder
- [x] Configurable via `DEBRIEF_CONFIG` object

### Files Created This Session
```
src/config/
└── llm.ts                    # LLM provider configuration

src/components/assistant/
├── AssistantPanel.tsx        # AI assistant UI
└── index.ts                  # Barrel export

supabase/functions/assistant/
└── index.ts                  # Edge Function for AI queries

src/pages/
├── PostSurveyPage.tsx        # NASA-TLX, SVI measures
└── DebriefPage.tsx           # Full debrief content

src/lib/
└── supabase.ts               # Added queryAssistant, getAssistantQueryCount
```

### Architecture Decisions

#### Provider-Agnostic LLM
**Rationale:**
- Supervisor may request different provider (OpenAI, free tier)
- Easy A/B testing with different models
- Cost flexibility (Together AI cheaper than Anthropic)
- Config in one place, Edge Function handles routing

#### Survey Measures
**NASA-TLX:** 2 items (mental demand, effort) - 21-point scale
**SVI:** 8 items - instrumental + relationship subscales
**Comprehension:** Role check, agreement check
**Feedback:** Optional open text

### Next Steps (from Session 4)
1. ~~**Deploy Edge Function** to Supabase~~ ✅ Done in Session 5
2. **End-to-end testing** with 2 participants
3. **Logging integration** - event types throughout app
4. **Data export** functionality

---

## Session 5 - January 22, 2026

### Completed Tasks

#### 24. Production Deployment
- [x] Created `vercel.json` with SPA routing configuration
- [x] Deployed frontend to Vercel
- [x] Fixed 404 error on client-side routes (SPA rewrite rules)
- [x] Set environment variables in Vercel dashboard

#### 25. Supabase Edge Function Deployment
- [x] Linked Supabase CLI to project
- [x] Set `ANTHROPIC_API_KEY` as Supabase secret
- [x] Deployed `assistant` Edge Function with `--no-verify-jwt`
- [x] Verified AI assistant is functional in production

#### 26. Bug Fixes
- [x] Fixed admin page blank screen after password login (hooks order issue)
- [x] Fixed offer system - accept/reject/counter buttons now show correctly
- [x] Fixed layout - right panel (offers + AI) now scrollable
- [x] Fixed copy URL buttons on admin page (robust URL construction)
- [x] Accepting an offer now properly ends the session

#### 27. Code Pushed to Production
- Committed all Session 3 & 4 changes (37 files)
- All features now live on Vercel

### GDPR Considerations Discussed
- Reviewed Maastricht University GDPR requirements
- Supabase as external data processor needs evaluation
- Data collected is pseudonymized (no names/emails)
- May need processing agreement or switch to UM infrastructure
- To discuss with data steward

### Production URLs
- **Frontend:** Vercel deployment URL
- **Admin:** `/admin` (password protected)
- **Edge Function:** `https://vvwysqtigbgeufyqutgd.supabase.co/functions/v1/assistant`

### Local Model Feasibility
Discussed running local LLM as fallback:
- User hardware: i5-10400F, 32GB RAM, RTX 2060 6GB VRAM
- Recommended: Mistral 7B Instruct (Q4 quantized) - fits in 6GB
- Platform already supports Ollama via `src/config/llm.ts`

### Known Issues to Monitor
- [ ] Offer buttons not appearing for one participant (intermittent?) - added debug logging
- [ ] Copy URL buttons were copying "http:/" - fixed with robust URL construction

### Files Modified
```
vercel.json                    # Created - SPA routing
src/pages/AdminPage.tsx        # Fixed login, copy buttons
src/pages/NegotiatePage.tsx    # Fixed offer flow, layout
src/components/negotiation/OfferPanel.tsx  # Added debug logging, fixed logic
README.md                      # Updated for production
```

### Next Steps
1. **Demo with supervisors** (January 23, 2026)
2. Discuss GDPR compliance with data steward
3. Consider tutorial/onboarding for participants
4. Design/layout refinements based on feedback
5. Data export functionality (Prompt 9)

---

## Session 6 - January 23, 2026

### Major Implementation Sprint

Completed comprehensive feature implementation across 3 sprints, addressing gaps identified in codebase audit.

#### Sprint 1: Critical Data Validity Features

##### 28. Timer Auto-termination
- [x] Session now auto-ends at 0:00 (no confirmation modal)
- [x] "Time Expired" overlay with 5-second countdown to post-survey
- [x] `forceEndSession()` logs `timer_expired` event
- [x] Chat and offers disabled immediately when time expires
- [x] Auto-navigation to post-survey

##### 29. Server-synced Timer
- [x] Timer uses `started_at` from server as single source of truth
- [x] Added `serverTimeOffset` prop to `NegotiationTimer` component
- [x] Both participants see synchronized countdown

##### 30. Post-survey Chat History
- [x] Added collapsible left sidebar showing read-only chat history
- [x] Participants can reference conversation while completing survey
- [x] `ChatMessageBubble` component for message display
- [x] Offer/acceptance/rejection messages styled distinctly

#### Sprint 2: Protocol Compliance Features

##### 31. Admin Timer Visibility
- [x] Real-time countdown timer in admin sessions table
- [x] Timer updates every second for active sessions
- [x] Color-coded: green → amber (5min) → red (1min) → EXPIRED
- [x] Shows time limit for waiting sessions, "Completed" for finished

##### 32. Admin Timer Extension
- [x] "+5 min" button per active session in admin panel
- [x] Updates `time_limit_minutes` in database
- [x] Participants see extended time immediately via realtime

##### 33. Three-Column Layout
- [x] Restructured NegotiatePage: Chat (50%) | Offer+Payoff (25%) | Assistant (25%)
- [x] All three columns always visible (removed collapsible assistant)
- [x] Better use of screen real estate

##### 34. Persistent Payoff Reference
- [x] Created `PayoffReference.tsx` component
- [x] Shows compact point values table for current role
- [x] Highlights best options
- [x] Collapsible but defaults to expanded
- [x] Positioned above Offer panel

##### 35. Enhanced Comprehension Checks
- [x] Replaced checkboxes with quiz questions in RoleBriefingPage
- [x] 3 questions: role identification, max points, best issue
- [x] Must answer correctly to proceed
- [x] Feedback on incorrect answers
- [x] Confidentiality reminder before continue button

#### Sprint 3: Research Flexibility Features

##### 36. Data Export UI
- [x] Export messages as CSV (FileText icon)
- [x] Export full session as JSON (Download icon)
- [x] JSON includes: session info, participants, messages, events, surveys
- [x] Helper functions: `toCSV()`, `downloadCSV()`
- [x] Export buttons for completed/active sessions

##### 37. Multi-scenario Support
- [x] Created `SCENARIOS` registry in `scenarios.ts`
- [x] `SCENARIO_LIST` for admin dropdown population
- [x] `getScenarioById()` helper function
- [x] Admin dropdown dynamically populated from registry
- [x] Removed "Custom Scenario" option

##### 38. AI Query Limit Configuration
- [x] Added `ai_query_limit` column to sessions table (default: 100)
- [x] Added `time_extension_minutes` column for tracking
- [x] Admin form includes query limit input
- [x] 0 = unlimited (shows "Unlimited queries" badge)
- [x] AssistantPanel respects per-session limit

##### 39. Error Boundaries
- [x] Created `ErrorBoundary` class component with recovery UI
- [x] `withErrorBoundary` HOC for wrapping components
- [x] App-level error boundary
- [x] Extra boundary around NegotiatePage for isolation
- [x] Development mode shows error details

#### Additional Changes

##### 40. Debrief Page Updates
- [x] Updated contact: stephen.mccarthy@maastrichtuniversity.nl
- [x] Added 2 placeholder contact boxes
- [x] Simplified study information (removed outcome-supposing language)
- [x] Changed data retention to "UM RDM policy"
- [x] Added note about saving participant ID for data deletion requests

##### 41. Three Canonical Scenarios
- [x] Implemented canonical payoff structure (shared across all scenarios)
- [x] Created 3 scenarios with identical point values, different labels:
  1. **Group Project Contract** - Project Coordinator vs Technical Specialist
  2. **Student Housing Agreement** - Lease Holder vs Incoming Tenant
  3. **Student Organization Budget** - Events Lead vs Communications Lead
- [x] 4 issues × 3 options each
- [x] Max 200 points per role
- [x] Pareto-efficient requires cross-issue trade-offs

##### 42. Default Value Changes
- [x] Time limit: 20 → 45 minutes
- [x] AI query limit: 20 → 100 queries

### Files Created/Modified

```
New Files:
├── src/components/layout/ErrorBoundary.tsx
├── src/components/layout/index.ts
├── src/components/negotiation/PayoffReference.tsx
└── supabase/migrations/004_session_config.sql

Modified Files:
├── src/App.tsx (error boundaries)
├── src/components/assistant/AssistantPanel.tsx (query limit override)
├── src/components/chat/NegotiationTimer.tsx (server time offset)
├── src/components/negotiation/index.ts (PayoffReference export)
├── src/config/llm.ts (default 100 queries)
├── src/config/scenarios.ts (complete rewrite - 3 canonical scenarios)
├── src/lib/supabase.ts (forceEndSession, export helpers)
├── src/pages/AdminPage.tsx (timer, export, query limit)
├── src/pages/DebriefPage.tsx (contact info, privacy text)
├── src/pages/NegotiatePage.tsx (3-column, auto-termination)
├── src/pages/PostSurveyPage.tsx (chat history sidebar)
├── src/pages/RoleBriefingPage.tsx (comprehension quiz)
└── src/types/database.types.ts (new session columns)
```

### Database Migration Required

Run on Supabase:
```sql
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS ai_query_limit INTEGER DEFAULT 100;

ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS time_extension_minutes INTEGER DEFAULT 0;

UPDATE sessions 
SET ai_query_limit = 100, time_extension_minutes = 0 
WHERE ai_query_limit IS NULL OR time_extension_minutes IS NULL;
```

### Canonical Payoff Structure

| Issue | Option A | Option B | Option C | Type |
|-------|----------|----------|----------|------|
| I1 | R1:60, R2:10 | R1:40, R2:30 | R1:20, R2:50 | Integrative (R1-high) |
| I2 | R1:50, R2:20 | R1:30, R2:40 | R1:10, R2:60 | Integrative (R1-high) |
| I3 | R1:10, R2:60 | R1:30, R2:40 | R1:50, R2:20 | Integrative (R2-high) |
| I4 | R1:40, R2:40 | R1:30, R2:30 | R1:20, R2:20 | Distributive |

**Max per role: 200 points** | Pareto-efficient requires trade-offs

### Next Steps
1. Test all 3 scenarios end-to-end
2. Verify timer auto-termination works correctly
3. Test data export functionality
4. Conduct full dyad test with comprehension quiz

---

## Session 7 - February 3, 2026

### Paper-Implementation Alignment

Analyzed disconnects between the research paper methodology (AI-NEG Draft 5) and the current implementation. Identified and resolved key issues with the participant flow and survey timing.

### Major Flow Change: Match-First, Survey-After

**Problem:** Original implementation had participants complete pre-survey BEFORE joining the waiting room. This caused:
- Survey data could be wasted if partner doesn't show
- Trust measures taken too early (not temporally close to AI interaction)
- Unclear how to link pre-survey data to in-session data if using external tools

**New Flow:**
```
Token URL → Consent → Waiting Room (match) → Pre-Survey → Wait for partner survey → Role Briefing → Negotiate → Post-Survey → Debrief
```

**Benefits:**
- Both participants confirmed present before survey time is "spent"
- Trust measures taken right before seeing the AI (methodologically cleaner)
- Same `participant_id` used throughout the entire flow
- Synchronized progression (both must complete survey before briefing)

### Completed Tasks

#### 43. Database Migration for Survey Tracking
- [x] Created `005_survey_flow_tracking.sql` migration
  - Added `pre_survey_completed_at` column to `session_participants`
  - Index for efficient survey completion queries
  - Helper function `check_both_surveys_complete()`

#### 44. TokenEntryPage Simplification
- [x] Removed waiting room logic (moved to JoinSessionPage)
- [x] After claiming token → navigate directly to JoinSessionPage
- [x] Cleaned up unused state and functions

#### 45. JoinSessionPage Major Rewrite
- [x] Added new page states for full survey flow:
  - `waiting_room` - Waiting for partner to join
  - `matched` - Both joined, ready for pre-survey
  - `pre_survey_pending` - Completed survey, waiting for partner
  - `ready_for_briefing` - Both surveys complete, proceed to briefing
- [x] Real-time subscription to `session_participants` updates
- [x] Survey completion tracking via `pre_survey_completed_at`
- [x] Synchronized progression between participants

#### 46. PreSurveyPage Updates
- [x] Added `markPreSurveyComplete()` call after submission
- [x] Navigate back to JoinSessionPage with `from=survey` parameter
- [x] Session code passed through URL for proper navigation

#### 47. LikertScale N/A Support
- [x] Added `allowNA` and `naLabel` props
- [x] Added `NA_VALUE` constant (-999) for N/A responses
- [x] N/A button styled differently from scale points
- [x] Exported `NA_VALUE` from questionnaire index

#### 48. PostSurveyPage Enhancements
- [x] **Added State Trust section** (3 items, same as Expected Trust)
  - Measures trust AFTER interacting with the AI
  - Enables trust change analysis (pre vs post)
- [x] **Added N/A option** to SVI Instrumental items:
  - `svi_satisfaction` - N/A allowed
  - `svi_balance` - N/A allowed
  - `svi_legitimacy` - N/A allowed
  - `svi_forfeit` - No N/A (answerable without agreement)
- [x] Updated sections: Workload → AI Assistant → Outcomes → Relationship → Feedback
- [x] Updated data schema version to 2.0

#### 49. Supabase Helper Functions
- [x] `markPreSurveyComplete()` - Update survey completion timestamp
- [x] `checkBothSurveysComplete()` - Check if both participants done
- [x] `getSessionParticipantsWithSurveyStatus()` - Get participants with survey status
- [x] `subscribeToSessionParticipantUpdates()` - Real-time survey completion tracking

### Files Created/Modified

```
New Files:
└── supabase/migrations/005_survey_flow_tracking.sql

Modified Files:
├── src/components/questionnaire/LikertScale.tsx (N/A support)
├── src/components/questionnaire/index.ts (export NA_VALUE)
├── src/lib/supabase.ts (survey flow helpers)
├── src/pages/TokenEntryPage.tsx (simplified, removed waiting room)
├── src/pages/JoinSessionPage.tsx (complete rewrite for survey flow)
├── src/pages/PreSurveyPage.tsx (mark complete, navigate back)
├── src/pages/PostSurveyPage.tsx (state trust, N/A options)
└── src/types/database.types.ts (pre_survey_completed_at)
```

### Database Migration Required

Run on Supabase:
```sql
-- Migration 005: Survey Flow Tracking
ALTER TABLE session_participants 
ADD COLUMN IF NOT EXISTS pre_survey_completed_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_session_participants_pre_survey 
ON session_participants(session_id, pre_survey_completed_at);
```

### Post-Survey Data Schema (v2.0)

```json
{
  "nasa_tlx": { "mental_demand": 1-7, "effort": 1-7 },
  "ai_trust_state": { "ai1": 1-7, "ai2": 1-7, "ai3": 1-7 },
  "subjective_value_inventory": {
    "instrumental": {
      "satisfaction": 1-7 | null,
      "satisfaction_is_na": boolean,
      "balance": 1-7 | null,
      "balance_is_na": boolean,
      "forfeit": 1-7,
      "forfeit_reversed": true,
      "legitimacy": 1-7 | null,
      "legitimacy_is_na": boolean
    },
    "relationship": { ... }
  },
  "comprehension_check": { ... },
  "feedback": string | null,
  "version": "2.0"
}
```

### Next Steps
1. Run database migration `005_survey_flow_tracking.sql`
2. Test new flow end-to-end with two browser windows
3. Verify State Trust items appear correctly in post-survey
4. Test N/A option functionality
5. Verify data is stored correctly with new schema

---

## March 2, 2025 – Batch matchmaking and cleanup

Brief summary of changes made today:

### Database (migrations 012–014)

- **012_match_batch_for_round.sql** – Batch matchmaking RPC: `match_batch_for_round(p_batch_id, p_slot_index)`. Locks `round_queue` for the batch and slot, groups by condition (from `batch_participants.condition_order`), builds a valid matching with no past opponents per bucket, creates round sessions, and removes matched participants from the queue. Returns number of sessions created. Avoids deadlock when batch size is 18 and condition orders are balanced.

- **013_batch_round_queue_counts.sql** – RPC for admin/client: `get_batch_round_queue_counts(p_batch_ids)`. Returns `(batch_id, round_number, queue_count)` for each batch and round (1–3) that has at least one participant in `round_queue`. Used for admin display and client-side auto-match when the queue is full.

- **014_clear_batches_and_round_sessions.sql** – Cleanup RPC: `clear_all_batches_and_round_sessions()`. Deletes round sessions (`round_number IS NOT NULL`), all `round_queue` rows, and all `experiment_batches` (CASCADE removes `batch_participants`). Returns deleted counts. Leaves participants and non-round sessions intact for a fresh test or experiment run.

- **015_match_batch_odd_bucket_and_guard.sql** – Fixes for `match_batch_for_round`: (1) Excludes participants who already have a round session for this slot (prevents double-matching). (2) When a condition bucket has an odd number, the RPC no longer raises; it creates sessions for everyone it can pair and leaves the odd participant(s) in the queue so they are not “floating” with no path forward — admin can run match again after adding one more participant or see queue count in batch row. Ensures 18-participant simulations can all get paired when condition orders are even (e.g. batch join assigns condition in pairs).

- **016_join_batch_atomic.sql** – RPC `join_batch_atomic(p_batch_id, p_participant_id)`: atomic batch join. Locks the batch row, counts current members, assigns condition_order in pairs (0,1 → perm 0; 2,3 → perm 1; …), inserts and returns. Prevents race when many tabs join at once so condition buckets stay even and no one is left "waiting for a partner" (e.g. 17 to briefing, 1 stuck in lobby). Client `joinBatch()` now calls this RPC instead of separate count + insert.

- **017_match_batch_cross_condition_pair.sql** – When exactly 2 participants remain in queue after same-condition matching (e.g. one odd from round A, one from round C), pair them in one cross-condition session (use first participant’s scenario). Ensures no one is left “waiting for a partner” when queue has an odd total (e.g. 17) or odd per-condition counts.

### Files touched

- `supabase/migrations/012_match_batch_for_round.sql` (new)
- `supabase/migrations/013_batch_round_queue_counts.sql` (new)
- `supabase/migrations/014_clear_batches_and_round_sessions.sql` (new)
- `supabase/migrations/015_match_batch_odd_bucket_and_guard.sql` (new)
- `supabase/migrations/016_join_batch_atomic.sql` (new)
- `supabase/migrations/017_match_batch_cross_condition_pair.sql` (new)
- `supabase/migrations/018_pre_seeded_round_schedule.sql` (new)
- `supabase/migrations/019_join_batch_generate_schedule.sql` (new)
- `src/lib/supabase.ts` (getOrCreateRoundSession, joinBatch uses join_batch_atomic)
- `src/pages/RoundLobbyPage.tsx` (pre-seeded path first when batchId present)
- `src/types/database.types.ts` (join_batch_atomic in Functions)

---

*Last Updated: March 2, 2025*
