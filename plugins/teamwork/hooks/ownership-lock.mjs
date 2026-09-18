#!/usr/bin/env node
// Teamwork - exclusive file ownership lease.
//
// PreToolUse hook on Write|Edit. Enforces the campaign invariant that no two
// Workers hold the same file at the same time ("exclusive file ownership").
//
// Design notes:
//   - It is a NO-OP unless an active campaign file exists at <cwd>/.teamwork/campaign.json.
//     Without that gate the hook would police every ordinary edit in every project.
//   - It is a LEASE, not a hard lock: a claim expires after `leaseMinutes` of inactivity,
//     so a crashed or abandoned Worker cannot deadlock the campaign forever.
//   - Owner identity is best-effort. See resolveOwner() - if ZCode does not surface a
//     per-subagent identifier in the hook payload, ownership degrades to first-come-first-served
//     within the session, which still prevents interleaved writes to one file.

import {readFileSync, writeFileSync, mkdirSync, existsSync, renameSync} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {createHash} from 'node:crypto';

const CAMPAIGN_REL = join('.teamwork', 'campaign.json');
const LOCK_REL = join('.teamwork', 'ownership.json');
const DEFAULT_LEASE_MINUTES = 10;

function emit(obj) {
	process.stdout.write(JSON.stringify(obj));
	process.exit(0);
}

function deny(reason) {
	emit({
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: 'deny',
			permissionDecisionReason: reason,
		},
	});
}

function allowWithContext(text) {
	emit({
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: 'allow',
			additionalContext: text,
		},
	});
}

async function readStdin() {
	let raw = '';
	process.stdin.setEncoding('utf8');
	for await (const chunk of process.stdin) raw += chunk;
	return raw;
}

// Normalise to a stable comparison key. Case-insensitive on Windows, and resolved
// against the session cwd so "src/a.ts" and "/abs/.../src/a.ts" are the same file.
function lockKey(filePath, cwd) {
	const abs = resolve(cwd, filePath);
	return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

function sha1(value) {
	return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

// Best-effort owner identity, strongest signal first.
function resolveOwner(input) {
	if (process.env.TEAMWORK_OWNER_TOKEN) return process.env.TEAMWORK_OWNER_TOKEN;
	for (const field of ['agent_id', 'agentId', 'agent_type', 'agentType']) {
		if (input[field]) return `agent:${input[field]}`;
	}
	// A subagent's transcript is usually its own file, so hashing it distinguishes
	// concurrent Workers better than the shared session id does.
	if (input.transcript_path) return `tx:${sha1(String(input.transcript_path))}`;
	return `session:${input.session_id ?? 'unknown'}`;
}

function extractFilePath(input) {
	const t = input.tool_input ?? {};
	for (const field of ['file_path', 'filePath', 'absolute_path', 'path']) {
		if (typeof t[field] === 'string' && t[field].length > 0) return t[field];
	}
	return undefined;
}

function writeAtomic(file, data) {
	mkdirSync(dirname(file), {recursive: true});
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, data, 'utf8');
	renameSync(tmp, file);
}

function readLeaseMinutes(campaign) {
	const value = Number(campaign?.ownership_lease_minutes);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_LEASE_MINUTES;
}

const raw = await readStdin();

let input;
try {
	input = JSON.parse(raw);
} catch {
	process.exit(0); // malformed payload: never block a tool call over it
}

const cwd = input.cwd || process.cwd();
const campaignPath = join(cwd, CAMPAIGN_REL);

// Gate: only police edits while a campaign is actually running.
if (!existsSync(campaignPath)) process.exit(0);

let campaign = {};
try {
	campaign = JSON.parse(readFileSync(campaignPath, 'utf8'));
} catch {
	process.exit(0);
}

const filePath = extractFilePath(input);
if (!filePath) process.exit(0); // nothing to own

const leaseMs = readLeaseMinutes(campaign) * 60_000;
const now = Date.now();
const lockPath = join(cwd, LOCK_REL);
const owner = resolveOwner(input);
const key = lockKey(filePath, cwd);

let store = {};
try {
	store = JSON.parse(readFileSync(lockPath, 'utf8'));
} catch {
	store = {};
}
if (store === null || typeof store !== 'object') store = {};

// Prune expired and malformed leases so an abandoned Worker cannot deadlock the campaign.
for (const [path, lease] of Object.entries(store)) {
	const fresh = lease && typeof lease.updatedAt === 'number' && now - lease.updatedAt <= leaseMs;
	if (!fresh) delete store[path];
}

const held = store[key];

if (held && held.owner !== owner) {
	deny(
		`File ownership conflict: ${filePath} is currently held by ${held.owner} ` +
			`(claimed ${Math.round((now - held.updatedAt) / 1000)}s ago, lease ${leaseMs / 60000} min). ` +
			`Teamwork allows only one Worker per file at a time. ` +
			`Pick a different file from your assigned scope, or report the conflict back to the orchestrator ` +
			`if your milestone cannot proceed without this one. ` +
			`If you believe the holder is gone, wait for the lease to expire rather than retrying in a loop.`,
	);
}

const reclaimed = !held;
store[key] = {owner, updatedAt: now};

try {
	writeAtomic(lockPath, JSON.stringify(store, null, 2));
} catch {
	process.exit(0); // lock bookkeeping must never block real work
}

const active = Object.keys(store).length;
if (reclaimed && active > 1) {
	allowWithContext(
		`Teamwork: claimed exclusive ownership of ${filePath}. ` +
			`${active} files are now held across the campaign.`,
	);
}

process.exit(0);
