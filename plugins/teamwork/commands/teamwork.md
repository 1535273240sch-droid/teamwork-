---
description: Open a Teamwork campaign — scope the objective, pick an integrity mode and pattern, then run a multi-agent team with independent verification.
argument-hint: "<objective>"
skills: teamwork
---

Open a Teamwork campaign for this objective:

$ARGUMENTS

If no objective was given, ask for one before doing anything else.

Now run **Phase 1 — Specify What, Not How**, following the `teamwork` skill:

1. Interview me on the five topics: Scope & Objectives, Requirements, Independent Verification, Acceptance Criteria, Project Working Directory. Ask in one batch. Push back on anything vague rather than filling the gap with an assumption.
2. Recommend an integrity mode (`development` / `demo` / `benchmark`) and say why.
3. Recommend a pattern from the five, and be explicit if the work is non-decomposable — parallelism that conflicts is worse than work that converges serially.
4. Write the charter to `.teamwork/campaign.json`.
5. Show me the charter and wait for approval.

Do not dispatch any subagents, and do not start implementing, until I approve.
