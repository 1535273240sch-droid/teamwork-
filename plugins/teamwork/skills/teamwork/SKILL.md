---
name: teamwork
description: Run a collaborative multi-agent campaign for repo-scale work - migrations, refactors across many files, simulations, and deep research. Use when a task spans many files or hours, needs independent verification of its own claims, or has repeatedly failed because a single agent kept agreeing with its own early mistakes. Not for small edits, single-file fixes, or work with a predictable cost per task.
when_to_use: The user invokes /teamwork, asks for a multi-agent team, asks for a task to be attacked and verified independently, or describes multi-day work spanning a repository. Also use when a previous single-agent attempt produced a confident result that could not be reproduced.
license: MIT
metadata:
  author: Teamwork for ZCode
  version: 0.1.0
---

# Teamwork — Phase 1: Specify What, Not How

You are opening a campaign. This phase is a scoping interview run by **you**, the primary agent. Do not start implementing. Do not delegate yet. A campaign that begins on a vague charter burns its whole budget discovering the goal was never defined.

The output of this phase is a **reviewable charter** the human approves. Only then does execution start.

## Step 1 — Interview

Fill all five sections. Ask about anything you cannot infer; state and flag anything you assume. Ask in batches, not one question at a time.

**Scope & Objectives.** What outcome, not what activity. Push until it is checkable: "reduce p95 latency under 200ms on the replay dataset", not "improve performance". If the user's phrasing is an activity, ask what changes in the world when it succeeds.

**Requirements.** Constraints that bound the work: languages, dependencies, interfaces that must not change, performance floors, licensing. Then explicitly: **what is out of scope.** Unowned scope is how a campaign grows without limit.

**Independent Verification.** How would someone who did not do the work confirm it? This is the section people answer lazily — "we'll run the tests". Push: which command, on what state, compared against what, run by whom. If the only verification is the implementer running their own check, say so plainly as a weakness rather than letting it pass.

**Acceptance Criteria.** A numbered list, each independently checkable and each tied to evidence. Reject any criterion satisfiable by a plan, a description, or a confident summary. For each one, name the command or artifact that proves it.

**Project Working Directory.** An absolute path. Default to the current workspace and confirm it.

## Step 2 — Integrity mode

Pick one and record it. Default `development` unless the user says otherwise.

- **development** — rapid iteration. Shortcuts allowed but must be recorded in the report.
- **demo** — someone else must reproduce the result from a clean state, unaided.
- **benchmark** — maximum strictness. Language standard library only. No generated fixtures, no expected values written after seeing the result, no test that merely asserts current behaviour.

In `benchmark` mode, say out loud that you will expect the Success Auditor to look for metric gaming, and that a partially-achieved honest result beats a gamed complete one.

## Step 3 — Select the pattern

Choose the orchestration shape that fits. Do not default to the most elaborate one.

| Pattern | Use when | Pipeline |
|---|---|---|
| **Iterative Coding** | Work that cannot be cleanly split — tightly coupled through a fast feedback loop, like one algorithm or one simulation | Implement → Critic → refine → Auditor |
| **Distributed Coding** | Work that fans out into genuinely independent workstreams | Orchestrator → parallel Workers → Critic → Auditor |
| **Long Proof** | An open question with dead ends — a conjecture, a search over strategies, a novel design | Explorer → Challenger (falsify) → Worker → Auditor |
| **Self-Verification** | A claim that must be checked at every step rather than only at the end | Worker → Auditor loop per milestone |
| **Document Review** | Analysis of a body of material rather than code | Explorer → Critic → synthesis → Auditor |

Be honest about the decomposition. If the parts are coupled, choosing Distributed Coding buys conflicts, not speed.

## Step 4 — Write the charter

Write it to `.teamwork/campaign.json` in the working directory. This file activates the ownership hook, so it must be well formed:

```json
{
  "objective": "<one sentence, checkable>",
  "integrity_mode": "development | demo | benchmark",
  "pattern": "iterative-coding | distributed-coding | long-proof | self-verification | document-review",
  "working_directory": "<absolute path>",
  "requirements": ["<constraint>"],
  "out_of_scope": ["<explicitly excluded>"],
  "verification_method": "<command or artifact that proves the result, and who runs it>",
  "acceptance_criteria": ["<numbered, independently checkable>"],
  "ownership_lease_minutes": 10,
  "approved": false,
  "phase": "scoping"
}
```

Also ensure `.teamwork/` is gitignored — it holds runtime campaign state, not source.

## Step 5 — Get approval

Present the charter to the human and wait. Switch to Plan mode if you want a structured review before execution. Do not set `approved: true` yourself, and do not start Phase 2 on an assumption of consent.

## Step 6 — Hand off

After approval, set `approved: true` and `phase: "execution"`, then:

1. **Sentinel** reviews the charter and returns CLEARED or BLOCKED. Do not proceed past BLOCKED — resolve it with the human instead.
2. **Orchestrator** decomposes into milestones with a dependency graph and a file-ownership table.
3. Set the goal with `/goal` so ZCode's per-round verification keeps the campaign converging without you typing "continue":
   ```
   /goal <objective> — verified by <verification method>
   ```
   Goal Mode demands real evidence (changed files, command output, test results) and will not accept a plan or a confident summary. That is the convergence loop; do not reimplement it.
4. Run the pattern. Dispatch Workers in parallel only where the ownership table allows.

## The invariant

**A milestone is not complete until an agent that did not implement it has verified it.** The verifier differs by what is in doubt:

- **Critic** — is the implementation wrong? Defects, edge cases, error paths, silent wrongness.
- **Challenger** — is the premise wrong? Falsify the measurement, the baseline, the causal story.
- **Auditor** — does the evidence exist and say what it claims? Reproduce it independently.
- **Success Auditor** — was the thing that was asked for actually done? Guards against goal displacement.

Running the same agent that built a thing to check the thing is not verification. It is a second opinion from the same source.

## Cost warning

This is expensive and it is slow. It is worth it when the work is large, the verification genuinely independent, and a wrong answer is costly. It is not worth it for a small edit — say so and do the work directly instead.
