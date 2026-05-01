# Polaris

Polaris is a full-stack, browser-based coding workspace with an AI assistant, real-time project state, background jobs, and live preview support.

## Overview

Polaris combines a multi-file editor, project management, AI-powered coding tools, and asynchronous workflows in a single web app. It is built with Next.js on the frontend, Convex for data and realtime sync, and Inngest for durable background execution.

## Core Features

- Multi-file cloud IDE with a file tree, tabs, and editor state persistence.
- AI-assisted workflows including inline suggestions, quick edit, and conversation-based help.
- Project-scoped conversations and message history.
- GitHub import and export flows powered by background jobs.
- In-browser preview pipeline using WebContainer and terminal output.
- Authenticated, user-scoped project and file access.

## Tech Stack

| Area | Stack |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Editor | CodeMirror 6, custom extensions |
| Data Layer | Convex |
| Background Jobs | Inngest |
| Auth | Clerk |
| AI | AI SDK + Groq |
| Preview Runtime | WebContainer + xterm.js |
| UI | Radix UI + shadcn/ui |

## Requirements

- Node.js 20+
- npm
- Accounts for Clerk, Convex, and Inngest
- At least one AI provider key (Groq is currently wired in this codebase)

## Local Setup

1. Clone and install dependencies.

```bash
git clone <your-repo-url>
cd polaris
npm install
```

2. Create a local environment file.

```bash
cp .env .env.local
```

3. Configure .env.local.

```env
# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
POLARIS_CONVEX_INTERNAL_KEY=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=

# Optional Clerk route config
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# AI
GROQ_API_KEY=

# Optional integrations
FIRECRAWL_API_KEY=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

4. Start local services in separate terminals.

```bash
npx convex dev
npx inngest-cli@latest dev
npm run dev
```

5. Open http://localhost:3000.

## Project Structure

```text
src/
  app/
    api/
      messages/
      suggestion/
      quick-edit/
      github/
      inngest/
    projects/
  features/
    auth/
    conversations/
    editor/
    preview/
    projects/
  components/
  inngest/
  lib/

convex/
  schema.ts
  projects.ts
  files.ts
  conversations.ts
  system.ts
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Deployment

Typical production setup:

1. Deploy Convex functions and schema.
2. Deploy Next.js app (for example on Vercel) with production env vars.
3. Configure Inngest to call the production endpoint at /api/inngest.
4. Configure Clerk production domains and redirect URLs.

## Notes

- Preview requires runnable project files in the project root (for Node projects, package.json must exist where install/dev commands run).
- Auth, Convex, and Inngest keys must all target the same environment to avoid token mismatch issues.

## License

Use this repository according to your project or organization licensing policy.
