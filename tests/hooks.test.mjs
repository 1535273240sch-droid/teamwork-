// Hook behaviour tests for the Teamwork ZCode plugin.
//
// Spawns the real hook scripts as child processes and feeds them the JSON payloads
// ZCode documents on stdin, then asserts on the stdout protocol and the on-disk lease.
//
//   node tests/hooks.test.mjs

import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, mkdtempSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(REPO, 'plugins', 'teamwork', 'hooks');
const WORK = mkdtempSync(join(tmpdir(), 'teamwork-hooks-'));
const CAMPAIGN = join(WORK, '.teamwork', 'campaign.json');
const LEASE = join(WORK, '.teamwork', 'ownership.json');

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
	if (ok) {
		pass++;
		console.log(`  PASS  ${name}`);
	} else {
		fail++;
		console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`);
	}
}

function run(script, payload) {
	const result = spawnSync(process.execPath, [join(HOOKS, script)], {
		input: JSON.stringify(payload),
		encoding: 'utf8',
	});
	return {stdout: (result.stdout || '').trim(), stderr: result.stderr || '', code: result.status};
}

function parse(out) {
	try {
		return JSON.parse(out);
	} catch {
		return undefined;
	}
}

function payload(over = {}) {
	return {
		session_id: 'session-1',
		transcript_path: 'C:/tmp/transcript-a.jsonl',
		cwd: WORK,
		permission_mode: 'default',
		hook_event_name: 'PreToolUse',
		tool_name: 'Write',
		tool_input: {file_path: 'src/core.ts', content: 'x'},
		tool_use_id: 'tool-1',
		...over,
	};
}

function reset({campaign = true} = {}) {
	rmSync(join(WORK, '.teamwork'), {recursive: true, force: true});
	if (campaign) {
		mkdirSync(join(WORK, '.teamwork'), {recursive: true});
		writeFileSync(
			CAMPAIGN,
			JSON.stringify({
				objective: 'Reduce p95 latency below 200ms on the replay dataset',
				integrity_mode: 'benchmark',
				pattern: 'self-verification',
				working_directory: WORK,
				acceptance_criteria: ['p95 < 200ms measured by bench.mjs on a cold cache'],
				ownership_lease_minutes: 10,
				phase: 'execution',
			}),
		);
	}
}

console.log('\nownership-lock.mjs');

// Without a campaign the hook must be a complete no-op, or it would police
// every ordinary edit in every project the plugin is installed in.
reset({campaign: false});
{
	const r = run('ownership-lock.mjs', payload());
	check('no campaign: exits 0', r.code === 0, `code=${r.code}`);
	check('no campaign: no output (no-op)', r.stdout === '', r.stdout.slice(0, 120));
	check('no campaign: writes no lease file', !existsSync(LEASE));
}

// First claim under a campaign: allowed, recorded.
reset();
{
	const r = run('ownership-lock.mjs', payload());
	check('first claim: exits 0', r.code === 0, `code=${r.code}`);
	const out = parse(r.stdout);
	check(
		'first claim: allowed (no deny)',
		r.stdout === '' || out?.hookSpecificOutput?.permissionDecision !== 'deny',
		r.stdout.slice(0, 160),
	);
	const lease = JSON.parse(readFileSync(LEASE, 'utf8'));
	const key = Object.keys(lease)[0] ?? '';
	check('first claim: lease written for the file', key.endsWith('core.ts'), key);
	check('first claim: owner recorded', String(lease[key]?.owner).startsWith('tx:'), JSON.stringify(lease[key]));
}

// A second, different owner on the same file must be denied.
{
	const r = run(
		'ownership-lock.mjs',
		payload({transcript_path: 'C:/tmp/transcript-b.jsonl', tool_use_id: 'tool-2'}),
	);
	const out = parse(r.stdout);
	check('conflict: exits 0', r.code === 0, `code=${r.code}`);
	check(
		'conflict: permissionDecision is deny',
		out?.hookSpecificOutput?.permissionDecision === 'deny',
		r.stdout.slice(0, 200),
	);
	check(
		'conflict: reason names the file and the holder',
		typeof out?.hookSpecificOutput?.permissionDecisionReason === 'string' &&
			out.hookSpecificOutput.permissionDecisionReason.includes('core.ts') &&
			out.hookSpecificOutput.permissionDecisionReason.includes('tx:'),
		out?.hookSpecificOutput?.permissionDecisionReason?.slice(0, 160),
	);
	check('conflict: hookEventName correct', out?.hookSpecificOutput?.hookEventName === 'PreToolUse');
}

// The same owner re-writing its own file is normal and must not be blocked.
{
	const r = run('ownership-lock.mjs', payload({tool_use_id: 'tool-3'}));
	check('re-claim by same owner: exits 0', r.code === 0, `code=${r.code}`);
	const out = parse(r.stdout);
	check('re-claim by same owner: not denied', out?.hookSpecificOutput?.permissionDecision !== 'deny', r.stdout);
}

// A different owner on a different file is a parallel Worker: unaffected.
{
	const r = run(
		'ownership-lock.mjs',
		payload({
			transcript_path: 'C:/tmp/transcript-b.jsonl',
			tool_input: {file_path: 'src/other.ts', content: 'y'},
		}),
	);
	const out = parse(r.stdout);
	check('different file: not denied', out?.hookSpecificOutput?.permissionDecision !== 'deny', r.stdout.slice(0, 160));
	const lease = JSON.parse(readFileSync(LEASE, 'utf8'));
	check('different file: both leases present', Object.keys(lease).length === 2, JSON.stringify(Object.keys(lease)));
}

// An abandoned Worker must not deadlock the campaign: the lease expires.
{
	const lease = JSON.parse(readFileSync(LEASE, 'utf8'));
	for (const k of Object.keys(lease)) lease[k].updatedAt = Date.now() - 11 * 60 * 1000;
	writeFileSync(LEASE, JSON.stringify(lease));
	const r = run(
		'ownership-lock.mjs',
		payload({transcript_path: 'C:/tmp/transcript-c.jsonl', tool_use_id: 'tool-4'}),
	);
	const out = parse(r.stdout);
	check('expired lease: reclaim allowed', out?.hookSpecificOutput?.permissionDecision !== 'deny', r.stdout.slice(0, 200));
	const after = JSON.parse(readFileSync(LEASE, 'utf8'));
	check('expired lease: single fresh lease remains', Object.keys(after).length === 1, JSON.stringify(after));
}

// Bookkeeping must never be the reason a tool call fails.
{
	const result = spawnSync(process.execPath, [join(HOOKS, 'ownership-lock.mjs')], {
		input: 'not json at all',
		encoding: 'utf8',
	});
	check('malformed stdin: exits 0 and stays silent', result.status === 0 && (result.stdout || '').trim() === '');
}

console.log('\nsession-context.mjs');

reset({campaign: false});
{
	const r = run('session-context.mjs', {...payload(), hook_event_name: 'SessionStart'});
	check('no campaign: silent', r.code === 0 && r.stdout === '', r.stdout.slice(0, 120));
}

reset();
{
	const r = run('session-context.mjs', {...payload(), hook_event_name: 'SessionStart', source: 'startup'});
	const out = parse(r.stdout);
	const ctx = out?.hookSpecificOutput?.additionalContext ?? '';
	check('campaign: exits 0', r.code === 0, `code=${r.code}`);
	check('campaign: hookEventName is SessionStart', out?.hookSpecificOutput?.hookEventName === 'SessionStart');
	check('campaign: objective injected', ctx.includes('p95 latency'), ctx.slice(0, 120));
	check('campaign: integrity mode injected', ctx.includes('benchmark'));
	check('campaign: acceptance criteria injected', ctx.includes('cold cache'));
	check('campaign: benchmark warning injected', ctx.includes('standard library only'));
	check('campaign: role protocol injected', ctx.includes('Success Auditor'));
}

rmSync(WORK, {recursive: true, force: true});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
