// Structural validation for the Teamwork ZCode plugin.
//
// ZCode silently ignores unrecognised frontmatter keys, so a typo in an agent file
// fails quietly instead of erroring. This asserts every key is one ZCode actually
// reads, that required keys are present, and that protocol files stay pure ASCII.
//
//   node tests/frontmatter.test.mjs

import {readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(REPO, 'plugins', 'teamwork');

// Keys ZCode documents for each component type.
const AGENT_KEYS = new Set([
	'name',
	'description',
	'model',
	'thoughtLevel',
	'color',
	'tools',
	'disallowedTools',
	'maxTurns',
	'injectAgentsMd',
	'mcpServers',
]);
const SKILL_KEYS = new Set(['name', 'description', 'when_to_use', 'license', 'metadata', 'allowed-tools']);
const COMMAND_KEYS = new Set(['description', 'argument-hint', 'allowed-tools', 'model', 'skills', 'disable-noninteractive']);

// ZCode tool names. A Command Code name (read_file, shell_command, ...) would
// grant nothing at all here, silently.
const ZCODE_TOOLS = new Set([
	'Read',
	'Grep',
	'Glob',
	'Bash',
	'Edit',
	'Write',
	'WebFetch',
	'WebSearch',
	'TodoWrite',
	'Agent',
	'Task',
]);

const AGENTS = [
	'sentinel',
	'orchestrator',
	'explorer',
	'worker',
	'critic',
	'challenger',
	'auditor',
	'success-auditor',
];

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

// Minimal frontmatter reader: flat `key: value` pairs plus one nested block
// (used by the skill's `metadata:`).
function frontmatter(text) {
	if (!text.startsWith('---')) return undefined;
	const end = text.indexOf('\n---', 3);
	if (end === -1) return undefined;
	const out = {};
	let nested = null;
	for (const rawLine of text.slice(3, end).split('\n')) {
		if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue;
		const indented = /^\s/.test(rawLine);
		const line = rawLine.trim();
		const idx = line.indexOf(':');
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (indented && nested) {
			out[nested][key] = value;
			continue;
		}
		if (value === '') {
			nested = key;
			out[key] = {};
			continue;
		}
		nested = null;
		out[key] = value;
	}
	return out;
}

function validate(label, path, allowed, required) {
	console.log(`\n${label}`);
	const text = readFileSync(path, 'utf8');
	const fm = frontmatter(text);
	if (!fm) {
		check(`${label}: has frontmatter`, false, 'no --- block');
		return {};
	}
	check(`${label}: has frontmatter`, true);
	for (const key of required) {
		check(`${label}: required "${key}" present`, typeof fm[key] === 'string' && fm[key].length > 0);
	}
	const unknown = Object.keys(fm).filter((k) => !allowed.has(k));
	check(`${label}: no unknown keys`, unknown.length === 0, unknown.join(', '));

	for (const field of ['tools', 'disallowedTools']) {
		if (!fm[field]) continue;
		const bad = fm[field]
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
			.filter((t) => !ZCODE_TOOLS.has(t));
		check(`${label}: ${field} are ZCode tool names`, bad.length === 0, bad.join(', '));
	}

	// ZCode ignores thoughtLevel unless the agent also pins a model.
	if (fm.thoughtLevel && !fm.model) {
		check(`${label}: thoughtLevel not set without model`, false, 'would be silently ignored');
	} else {
		check(`${label}: model/thoughtLevel pairing valid`, true);
	}

	if (fm.maxTurns !== undefined) {
		check(`${label}: maxTurns is a positive integer`, /^\d+$/.test(fm.maxTurns) && Number(fm.maxTurns) > 0, fm.maxTurns);
	}
	return fm;
}

console.log('=== agents ===');
const seen = new Set();
for (const name of AGENTS) {
	const fm = validate(`agents/${name}.md`, join(PLUGIN, 'agents', `${name}.md`), AGENT_KEYS, ['name', 'description']);
	check(`agents/${name}.md: name matches filename`, fm.name === name, `frontmatter="${fm.name}" file="${name}"`);
	check(`agents/${name}.md: name is unique`, !seen.has(fm.name));
	seen.add(fm.name);
	// ZCode's built-in roles cannot have their names reused.
	check(`agents/${name}.md: not a reserved ZCode name`, !['general-purpose', 'explore'].includes(fm.name));
}

console.log('\n=== skill ===');
validate('skills/teamwork/SKILL.md', join(PLUGIN, 'skills', 'teamwork', 'SKILL.md'), SKILL_KEYS, ['name', 'description']);

console.log('\n=== command ===');
{
	const fm = validate('commands/teamwork.md', join(PLUGIN, 'commands', 'teamwork.md'), COMMAND_KEYS, ['description']);
	const body = readFileSync(join(PLUGIN, 'commands', 'teamwork.md'), 'utf8');
	check('commands/teamwork.md: body uses $ARGUMENTS', body.includes('$ARGUMENTS'));
	check('commands/teamwork.md: mounts the teamwork skill', fm.skills === 'teamwork', fm.skills);
}

console.log('\n=== manifest ===');
{
	const plugin = JSON.parse(readFileSync(join(PLUGIN, '.zcode-plugin', 'plugin.json'), 'utf8'));
	check('plugin.json: name is valid', /^[a-z0-9][a-z0-9._-]{0,127}$/.test(plugin.name), plugin.name);
	// hooks/hooks.json is the standard location and is auto-discovered; declaring it
	// again makes ZCode emit a duplicate-component diagnostic.
	check('plugin.json: does not re-declare the standard hooks path', plugin.hooks === undefined);

	const market = JSON.parse(readFileSync(join(REPO, 'marketplace.json'), 'utf8'));
	check('marketplace.json: name is valid', /^[a-z0-9][a-z0-9._-]{0,127}$/.test(market.name), market.name);
	const entry = (market.plugins ?? []).find((p) => p.name === plugin.name);
	check('marketplace.json: lists the teamwork plugin', Boolean(entry));
	check('marketplace.json: entry has a source', typeof entry?.source === 'string' && entry.source.length > 0);
	// The marketplace `version` drives update checks; it must be bumped when the
	// plugin changes or installs will not be offered an update.
	check('marketplace.json: entry version matches plugin.json', entry?.version === plugin.version, `${entry?.version} vs ${plugin.version}`);
}

console.log('\n=== protocol files are pure ASCII ===');
// Config and hook payloads cross an encoding boundary into ZCode's runtime.
// Markdown is read as UTF-8 by the model and is fine; these are not.
for (const rel of ['hooks/hooks.json', 'hooks/ownership-lock.mjs', 'hooks/session-context.mjs']) {
	const text = readFileSync(join(PLUGIN, rel), 'utf8');
	const bad = [...text].filter((c) => c.charCodeAt(0) > 127);
	check(`${rel}: ASCII only`, bad.length === 0, `found: ${[...new Set(bad)].join('')}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
