# Project Metadata

ASANA_PROJECT_ID: TBD
COMPANY: Elandz
PROJECT_NAME: Guest Squad CRM
PROJECT_STATUS: IN_DEVELOPMENT

GITHUB_REPO_NAME: raptric/guest-squad-crm

# Tech Stack
Next.js (App Router, TypeScript), Supabase (Postgres + Auth), Resend (transactional email),
Tailwind CSS + shadcn/ui, deployed on Vercel.

# Workflow References
# Planning: ~/.claude/workflows/planning-phase.md
# Development: ~/.claude/workflows/dev-phase.md
# Git: ~/.claude/workflows/git-standards.md
# Errors: ~/.claude/workflows/error-handling.md

# Notes
- PRD and finalized DB schema live in ../Hotel Prospecting/PRD.md and
  ../Hotel Prospecting/database/schema.sql — this project implements that PRD.
- Supabase project (dev, single environment for now): rsbicwtedhlwpmpdnuba
  (aws-0-us-west-2 pooler region). Schema already applied.
- Build is happening step-wise per an approved plan: Step 0 (repo/config foundation) →
  Step 1 (Supabase wiring) → Step 2 (auth + super admin first-boot wizard) →
  Step 3 (email via Resend) → Step 4 (deploy to Vercel). Each step ends with a manual test
  before moving to the next.
- App must be configurable via env vars only (no hardcoded environment-specific values) so
  it can boot in any environment, not just this Vercel project.

@AGENTS.md
