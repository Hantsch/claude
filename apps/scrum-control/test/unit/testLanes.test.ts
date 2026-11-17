/**
 * CLAUDE.md is pasted into every agent prompt, so its lane table must keep matching the
 * scripts and workflows it names. Docs are read as text on purpose.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

async function read(path: string): Promise<string> {
  return readFile(join(ROOT, path), 'utf8');
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

/** Rows (header included, separator dropped) of the first table after the `## Test lanes` heading. */
function laneTable(md: string): string[][] {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## Test lanes/.test(l));
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith('|')) {
      inTable = true;
      if (!/^\|[\s|:-]+\|$/.test(line.trim())) rows.push(cells(line));
    } else if (inTable) break;
  }
  return rows;
}

describe('test lanes in CLAUDE.md', () => {
  it('the lane table has Story, PR, Release and Perf rows under lane, trigger, runs, blocks and budget', async () => {
    const md = await read('CLAUDE.md');
    expect(md.split(/\r?\n/).filter((l) => /^## Test lanes/.test(l))).toHaveLength(1);
    const [header, ...rows] = laneTable(md);
    expect(header).toEqual(['Lane', 'Trigger', 'Runs', 'Blocks', 'Budget']);
    expect(rows.map((r) => r[0])).toEqual(expect.arrayContaining(['Story', 'PR', 'Release', 'Perf']));
    expect(rows).toHaveLength(4);
    const row = (name: string): string[] => {
      const found = rows.find((r) => r[0]?.startsWith(name));
      expect(found, `lane row ${name}`).toBeDefined();
      return found ?? [];
    };
    expect(row('Story')[4]).toContain('30 s');
    expect(row('PR')[4]).toContain('30 s');
    expect(row('Release')[4]).toMatch(/(^|[^\d])0 s/);
    expect(row('Perf')[3]?.toLowerCase()).toContain('nothing');
  });

  it('every command and workflow the lane table names exists', async () => {
    const md = await read('CLAUDE.md');
    const table = laneTable(md).map((r) => r.join(' | ')).join('\n');
    const scripts = (JSON.parse(await read('package.json')) as { scripts: Record<string, string> }).scripts;

    const named = [...table.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1] as string);
    for (const name of named) expect(scripts, `npm run ${name}`).toHaveProperty(name);
    expect(table, 'lane table names npm test').toMatch(/npm test\b/);
    expect(scripts).toHaveProperty('test');

    // The workflows live at the repository root, outside this app, so only their names are pinned.
    const workflows = [...table.matchAll(/\.github\/workflows\/[\w.-]+\.yml/g)].map((m) => m[0]);
    expect(workflows.map((w) => w.split('/').pop())).toEqual(
      expect.arrayContaining(['scrum-control-validate.yml', 'scrum-control-release.yml']),
    );
    expect(named).toContain('test:perf');
  });

  it('the flake policy is stated inline, not linked to a process doc that is not here', async () => {
    const md = await read('CLAUDE.md');
    expect(md).not.toContain('.claude/commands/sprint.md');
    const policy = /\*\*Flaky tests\.\*\*([\s\S]*?)(\n\n|$)/.exec(md)?.[1] ?? '';
    expect(policy, 'inline flake policy paragraph').not.toBe('');
    expect(policy).toMatch(/defect/);
    expect((md.match(/quarantine/gi) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe('the story gate', () => {
  it('the per-story gate runs the whole suite', async () => {
    const rows = laneTable(await read('CLAUDE.md'));
    const story = rows.find((r) => r[0] === 'Story');
    expect(story?.[2]).toContain('npm test');
    expect(story?.[2]).toContain('whole suite');
  });

  it('CONTRIBUTING puts N4 and N5 in the perf lane', async () => {
    const named = (await read('CONTRIBUTING.md')).split(/\r?\n/).filter((l) => /N4|N5/.test(l));
    expect(named.length).toBeGreaterThan(0);
    for (const line of named) expect(line, line).toContain('test:perf');
  });
});
