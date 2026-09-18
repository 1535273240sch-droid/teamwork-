# examples/

**This directory is empty on purpose.**

It is meant to hold complete traces of real campaigns. It does not yet, and nothing here is
fabricated to fill the gap.

## Why it matters

The single hardest thing to judge about this project from the outside is whether the process is worth
its cost. The README claims that four independent verification roles catch things a single agent misses,
and that a campaign honestly reported as `PARTIALLY ACHIEVED` beats one confidently reported as complete.
Those are claims. A real trace is the evidence, and its absence is the largest credibility gap in this
repository.

It also has a second use: the same trace is what a reader checks the *format* against. Prose describing
`.teamwork/verifications/m1.md` is not the same as seeing one that a real Critic wrote.

## Why it is not filled in yet

Filling it requires actually running a campaign. A synthesized "example campaign" would be a fabricated
result presented as evidence — in a project whose entire thesis is that confident summaries are not
evidence, and that verification must be independent of the thing being verified. Writing one would
contradict the thing this repository is for.

So this stays empty until a real run happens. If you run a campaign and want to contribute it, that is
the most valuable contribution this repository can receive.

## What belongs here

One directory per campaign, named for the objective, containing the runtime state **verbatim**:

```
examples/<campaign-slug>/
├── README.md                  <- what the campaign was, and what it concluded
├── campaign.json              <- the approved charter
├── plan.json                  <- milestones, dependency graph, ownership table
├── verifications/             <- one file per milestone, as the verifiers wrote them
│   ├── m1.md
│   └── m2.md
├── final-audit.md             <- the Success Auditor verdict
├── events.jsonl               <- claims, denials, expiries (optional but informative)
└── diff.patch                 <- the resulting change, so a reader can check the work
```

`ownership.json` is deliberately **not** included: it holds absolute paths from the machine that ran the
campaign. `events.jsonl` may need paths redacted the same way.

## Before you commit one

- **Redact machine-specific paths.** Absolute paths from your home directory should become placeholders.
- **Do not clean up the verdicts.** If a milestone was rejected and reworked, keep the rejection. A trace
  where everything passed on the first try is not more convincing, it is less — it looks staged.
- **Do not edit the verification records.** Their value is that a verifier wrote them, not that they read
  well. If a verdict is `DIVERGED` or `NOT ACHIEVED`, that is the most useful thing in the directory.
- **State the cost.** Token usage and wall-clock time, honestly. The README tells people this is expensive;
  a trace that hides the price is misleading.

## The most useful campaign to contribute

One where the framework **caught something** — a Critic that found a real defect, a Challenger that killed
a false premise, an Auditor that reproduced a `DIVERGED` result, or a Success Auditor that returned
`PARTIALLY ACHIEVED` when every milestone had passed. That is the case the design exists for, and the one a
reader cannot evaluate from the README alone.
