# Expense Tracker working agreement

## Product and architecture

- Build a dependable Android expense tracker for Brendon and friends. Prefer reliable entry, correct totals, and recoverable data over additional features.
- `mobile/` is the Expo / React Native app; `src/` is the React web app.
- `api/` and `lib/` are the Vercel API used by BOTH installed Android clients and the website. Supabase provides authentication and persistent data; `supabase/` contains schema and migrations.
- `backend/` is a separate Express / SQLite alternative, not the production backend.
- A push to `main` can deploy the shared API. A Play Store release is separate, but existing Android clients depend on backward-compatible API and database changes.
- Brendon wants to focus on development and staging for now. Commit checkpoints when requested; do not update the live backend or Play Store app without explicit release authorization.
- Check current package files and source rather than assuming recorded version numbers are still current.

## UI references — Brendon's preference

Whenever building or redesigning a UI, consult both Godly (https://godly.website/; gallery also https://godly.design/) and Watermelon UI (https://ui.watermelon.sh/) first. Select references relevant to the audience and task, and briefly explain the useful ideas. Adapt to the existing design and stack; do not install a library or copy an entire design just to follow a reference. If a resource is inaccessible, state the limitation and continue with available references.

## Selective multi-agent workflow

The main chat is the lead, planner, and architect. Delegate bounded work to subagents when this adds useful independent scrutiny or parallel progress. These instructions explicitly request delegation for substantial implementations and reviews; do not create extra user-owned chats for these subtasks.

- Small explanations, documentation corrections, and trivial edits: the lead works directly.
- Substantial feature, bug fix, or dependency migration: assign implementation to `developer` (or implement as lead), then obtain an independent `tester_reviewer` assessment of the finished changes.
- Authentication, authorization/RLS, API, database, import/export, credential handling, or sensitive dependency changes: also use `security_reviewer`. Include security review before a public release.
- Architecture research: use `lead_planner` only when an independent investigation would help; the main chat retains ownership of the decision.
- Use at most three subagents concurrently, within the host's available limits. Do not launch every role for every request. Subagents must not recursively delegate unless the lead explicitly assigns that responsibility.
- Role definitions live in `.codex/agents/`. If the current tool cannot select a named custom agent, read the relevant role file and include its instructions in the delegated task. Do not claim role-specific sandbox enforcement when the tool only inherits the parent's permissions.
- Do not override the user's selected model or reasoning effort. Roles inherit those settings.

## Assignment and ownership

Each assignment must include the question or objective, acceptance criteria, relevant files, permitted edit scope, baseline commit/diff, verification expectations, and a concise expected report.

- One owner at a time for shared files, package manifests/lockfiles, dependency installation, migrations, and builds that write to shared output folders.
- Reviewers inspect a stable snapshot. Record the reviewed commit or diff; re-review relevant changes made after the review.
- Prefer read-only parallel research/review. Use managed isolated worktrees for independent implementations when necessary, then integrate sequentially.
- A tester may create tests in an explicitly assigned test scope and write temporary outputs, but must not silently change product code. Security review is read-only by default.
- The lead resolves conflicting findings using source evidence or reproduction, integrates fixes, and provides one final report. Agent agreement alone is not validation.
- Subagents do not commit, push, deploy, submit releases, change production data, or access production secrets as part of their assigned implementation/review tasks. The lead handles those operations when authorized by the user; do not ask again for authorization already given for the current action.

## Verification and release evidence

Choose checks that match the change; do not rerun unrelated checks or add tests that merely restate the implementation.

- Web: `npm run build`.
- Mobile: from `mobile/`, `npx tsc --noEmit`, `npx expo-doctor`, and Android bundle export to a temporary output directory when dependencies or build paths change.
- Upgrade Expo incrementally with SDK-compatible native dependencies. Read official migration notes; never use forced audit fixes as a substitute for compatibility work.
- Financial logic: test money precision, local dates, month/year boundaries, recurring idempotency and failed writes, and import failure recovery as relevant.
- Data access: use isolated test accounts/data to verify user A cannot read or change user B's records. Do not run destructive tests against the production database.
- A JavaScript bundle is not a native Android build. Native changes require a fresh Android build and device smoke testing before release. Report missing tooling or device verification explicitly.
- Report exact checks and outcomes, unresolved findings, and untested areas. Do not label the app secure or regression-free based only on builds or dependency audits.

## Current known follow-up work

These are starting points to verify, not proof of current behavior:
- Reliability migration and hosted concurrency checks passed on isolated `expense-tracker-staging` (`tfjegsgjwyzcixlueosi`); see README evidence. `mobile/npm run start:staging` connects Expo to the isolated local API with separate login storage. Brendon confirmed the requested phone checks passed, including JSON restore after the file-picker fix. Production rollout remains deferred. Do not assume the production database has these guards.
- New restore is transactional and exports six account tables; see README rollout notes. Older installed clients still have the unsafe multi-request restore; device-local templates/preferences are excluded.
- Session refresh, account-scoped local storage, currency/date consistency, and account recovery/deletion need review.
- Separate development app identity and test data from the installed production app.
