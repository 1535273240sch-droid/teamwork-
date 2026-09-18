---
description: Close the current Teamwork campaign — archive its state to .teamwork/history/ and disarm the ownership hooks. Asks for confirmation first.
allowed-tools: Read, Grep, Glob, Bash
---

Close the Teamwork campaign in this workspace.

**Ask the human to confirm first.** Say clearly what will happen: the campaign ends, its state is archived, and the ownership hooks go inert so ordinary editing is unrestricted again. Do not proceed on an assumption of consent.

If they confirm, archive rather than delete — a campaign record is evidence, and evidence that can be thrown away is not evidence:

1. Read `.teamwork/campaign.json` and report the objective and the final state before touching anything.
2. Create `.teamwork/history/<UTC timestamp>/`, using the format `YYYY-MM-DDTHH-MM-SSZ` (colons are not valid in a directory name on Windows).
3. **Move** into that directory, skipping any that do not exist: `campaign.json`, `plan.json`, `ownership.json`, `events.jsonl`, `verifications/`, `final-audit.md`.
4. Leave `.teamwork/` itself in place — it is gitignored and `history/` lives inside it. Do not delete the directory.
5. Remove any leftover `.teamwork/.lock` directory and any `*.tmp` files, so a stale mutex cannot delay the next campaign.

Then report:

- where the archive went, and what is in it,
- the final verdict from `final-audit.md` if it exists, and if it does not, say that the campaign was closed **without** a final audit — that is a real gap, not a formality,
- that the ownership hooks are now inert, and that running `/teamwork <objective>` starts a fresh campaign.

If `.teamwork/campaign.json` does not exist, say that no campaign is running and stop.
