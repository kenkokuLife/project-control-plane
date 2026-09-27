import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDashboard, formatUtc, repoUrl, safeHttpUrl } from './dashboard.ts';
import type { ProjectStatusV1 } from './project-status.ts';
import { refreshProjects } from './refresh.ts';
import type { FailedProjectEntry, OkProjectEntry, ProjectEntry, RefreshResult } from './refresh.ts';
import type { Registry } from './registry.ts';

const AT = '2026-09-26T08:00:00.000Z';
const source = (id: string) => ({ id, repo: `owner/${id}`, statusPath: '.project/status.json' });
const ok = (id: string, overrides: Partial<ProjectStatusV1> = {}): OkProjectEntry => ({
  project: {
    schemaVersion: 1, id, name: `Project ${id}`, summary: 'Example project',
    status: 'active', stage: 'design', current: ['Doing'], next: ['Then'],
    publicUrl: null, updatedAt: '2026-09-01', ...overrides,
  },
  source: source(id),
  sync: { state: 'ok', syncedAt: AT },
});
const failed = (id: string, state: FailedProjectEntry['sync']['state'] = 'unavailable'): FailedProjectEntry => ({
  source: source(id),
  sync: { state, syncedAt: AT, error: { code: 'status_file_not_found', message: 'Status file was not found on the default branch', httpStatus: 404 } },
});
const result = (...projects: ProjectEntry[]): RefreshResult => ({ generatedAt: AT, projects });
const groupIds = (view: ReturnType<typeof buildDashboard>) =>
  Object.fromEntries(view.groups.map(group => [group.key, group.projects.map(p => p.id)]));

test('groups projects by status in fixed order Active, Paused, Completed / Archived, Idea', () => {
  const view = buildDashboard(result(
    ok('i', { status: 'idea' }),
    ok('c', { status: 'completed' }),
    ok('a1'),
    ok('p', { status: 'paused' }),
    ok('r', { status: 'archived' }),
    ok('a2'),
  ));
  assert.deepEqual(view.groups.map(group => group.title), ['Active', 'Paused', 'Completed / Archived', 'Idea']);
  assert.deepEqual(groupIds(view), { active: ['a1', 'a2'], paused: ['p'], closed: ['c', 'r'], idea: ['i'] });
});

test('completed and archived share one group and keep their own status badge', () => {
  const view = buildDashboard(result(ok('c', { status: 'completed' }), ok('r', { status: 'archived' })));
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0]!.key, 'closed');
  assert.deepEqual(view.groups[0]!.projects.map(p => p.status), ['completed', 'archived']);
});

test('empty groups are omitted', () => {
  const view = buildDashboard(result(ok('p', { status: 'paused' })));
  assert.deepEqual(view.groups.map(group => group.key), ['paused']);
});

test('mixed success and failure: every entry lands in exactly one place, failures in issues', () => {
  const view = buildDashboard(result(ok('a'), failed('x', 'invalid'), ok('i', { status: 'idea' }), failed('y', 'unauthorized')));
  assert.deepEqual(view.counts, { total: 4, ok: 2, issues: 2 });
  assert.deepEqual(groupIds(view), { active: ['a'], idea: ['i'] });
  assert.deepEqual(view.issues.map(issue => [issue.id, issue.state]), [['x', 'invalid'], ['y', 'unauthorized']]);
});

test('failed entries are never dropped, even when every project fails', () => {
  const view = buildDashboard(result(failed('x'), failed('y', 'unauthorized'), failed('z', 'invalid')));
  assert.deepEqual(view.groups, []);
  assert.deepEqual(view.counts, { total: 3, ok: 0, issues: 3 });
  assert.deepEqual(view.issues.map(issue => issue.state), ['unavailable', 'unauthorized', 'invalid']);
});

test('sync issue exposes identity, source and safe error fields only', () => {
  const entry = failed('x');
  // Anything outside the allowlist (e.g. a stray token or response body) must not reach the page.
  Object.assign(entry.sync.error, { authorization: 'Bearer secret', body: 'raw response' });
  Object.assign(entry.sync, { debug: '/Users/someone/repo' });
  const [issue] = buildDashboard(result(entry)).issues;
  assert.deepEqual(issue, {
    id: 'x', repo: 'owner/x', repoUrl: 'https://github.com/owner/x', statusPath: '.project/status.json',
    state: 'unavailable', code: 'status_file_not_found', message: 'Status file was not found on the default branch',
    httpStatus: 404, syncedAt: AT,
  });
  assert.doesNotMatch(JSON.stringify(issue), /secret|raw response|\/Users\//);
});

test('missing httpStatus becomes null rather than undefined', () => {
  const entry = failed('x');
  entry.sync.error = { code: 'network_error', message: 'Network error while contacting GitHub' };
  assert.equal(buildDashboard(result(entry)).issues[0]!.httpStatus, null);
});

test('healthy project view carries all required Dashboard fields', () => {
  const [project] = buildDashboard(result(ok('a', { publicUrl: 'https://example.com/app' }))).groups[0]!.projects;
  assert.deepEqual(project, {
    id: 'a', name: 'Project a', summary: 'Example project', status: 'active', stage: 'design',
    current: ['Doing'], next: ['Then'], updatedAt: '2026-09-01', publicUrl: 'https://example.com/app',
    repo: 'owner/a', repoUrl: 'https://github.com/owner/a', syncState: 'ok',
  });
});

test('publicUrl null or non-http(s) yields no link', () => {
  const urls = [null, 'javascript:alert(1)', 'mailto:someone@example.com', 'not a url'];
  const view = buildDashboard(result(...urls.map((publicUrl, index) => ok(`p${index}`, { publicUrl }))));
  assert.deepEqual(view.groups[0]!.projects.map(p => p.publicUrl), [null, null, null, null]);
  assert.equal(safeHttpUrl('http://example.com'), 'http://example.com');
  assert.equal(safeHttpUrl(undefined), null);
});

test('empty result renders as an empty view without errors', () => {
  const view = buildDashboard(result());
  assert.deepEqual(view, { generatedAt: AT, counts: { total: 0, ok: 0, issues: 0 }, groups: [], issues: [] });
});

test('works end to end on refreshProjects output: empty and mixed registries', async () => {
  const now = () => new Date(AT);
  const empty = await refreshProjects({ registry: { version: 1, projects: [] }, now });
  assert.deepEqual(buildDashboard(empty).counts, { total: 0, ok: 0, issues: 0 });

  const registry: Registry = { version: 1, projects: [
    { id: 'good', repo: 'owner/good', enabled: true, statusPath: '.project/status.json' },
    { id: 'bad', repo: 'owner/bad', enabled: true, statusPath: '.project/status.json' },
    { id: 'off', repo: 'owner/off', enabled: false, statusPath: '.project/status.json' },
  ] };
  const readStatus = async (project: Registry['projects'][number]) => {
    if (project.id === 'bad') throw new Error('boom at /Users/someone/secret');
    const status = ok(project.id).project;
    return { projectId: project.id, repo: project.repo, statusPath: project.statusPath, defaultBranch: 'main', rawJson: '', status };
  };
  const view = buildDashboard(await refreshProjects({ registry, readStatus, now }));
  assert.deepEqual(view.counts, { total: 2, ok: 1, issues: 1 });
  assert.deepEqual(groupIds(view), { active: ['good'] });
  assert.equal(view.issues[0]!.code, 'unexpected_error');
  assert.doesNotMatch(JSON.stringify(view), /boom|\/Users\//);
});

test('formatting helpers', () => {
  assert.equal(formatUtc(AT), '2026-09-26 08:00 UTC');
  assert.equal(formatUtc('garbage'), 'garbage');
  assert.equal(repoUrl('kenkokuLife/project-control-plane'), 'https://github.com/kenkokuLife/project-control-plane');
});
