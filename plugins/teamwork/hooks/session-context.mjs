#!/usr/bin/env node
// Teamwork - inject the active campaign charter at session start.
//
// SessionStart hook. If a campaign is running in this workspace, the model sees the
// objective, the integrity mode, and the role protocol before its first turn, so a
// resumed or newly opened session continues the campaign instead of drifting.
//
// No-op when there is no active campaign.

import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const CAMPAIGN_REL = join('.teamwork', 'campaign.json');

async function readStdin() {
	let raw = '';
	process.stdin.setEncoding('utf8');
	for await (const chunk of process.stdin) raw += chunk;
	return raw;
}

function emit(obj) {
	process.stdout.write(JSON.stringify(obj));
}

const raw = await readStdin();

let input;
try {
	input = JSON.parse(raw);
} catch {
	process.exit(0);
}

const cwd = input.cwd || process.cwd();
const campaignPath = join(cwd, CAMPAIGN_REL);

if (!existsSync(campaignPath)) process.exit(0);

let campaign;
try {
	campaign = JSON.parse(readFileSync(campaignPath, 'utf8'));
} catch {
	process.exit(0);
}

const lines = [];

lines.push('A Teamwork campaign is active in this workspace.');
lines.push('');

if (campaign.objective) lines.push(`Objective: ${campaign.objective}`);
if (campaign.integrity_mode) lines.push(`Integrity mode: ${campaign.integrity_mode}`);
if (campaign.working_directory) lines.push(`Working directory: ${campaign.working_directory}`);
if (campaign.phase) lines.push(`Phase: ${campaign.phase}`);

if (Array.isArray(campaign.acceptance_criteria) && campaign.acceptance_criteria.length > 0) {
	lines.push('');
	lines.push('Acceptance criteria (judged against real evidence, not summaries):');
	for (const criterion of campaign.acceptance_criteria) lines.push(`- ${criterion}`);
}

if (campaign.integrity_mode === 'benchmark') {
	lines.push('');
	lines.push(
		'Benchmark integrity mode is in force: language standard library only, no generated fixtures, ' +
			'no expected values written after seeing the result, no test that merely asserts current behaviour.',
	);
}

lines.push('');
lines.push('Role protocol:');
lines.push('- Explorer gathers evidence read-only. Worker implements one milestone inside an assigned file scope.');
lines.push(
	'- No two Workers hold the same file at once. A write to a file held by another Worker is blocked ' +
		'by the ownership hook - choose a different file or report the conflict.',
);
lines.push('- Critic hunts defects in the implementation. Challenger attacks the premise. Auditor reproduces evidence.');
lines.push('- Success Auditor judges the finished campaign against the charter, not against the milestone list.');
lines.push('- A milestone is not complete until an agent that did not implement it has verified it.');

emit({
	hookSpecificOutput: {
		hookEventName: 'SessionStart',
		additionalContext: lines.join('\n'),
	},
});

process.exit(0);
