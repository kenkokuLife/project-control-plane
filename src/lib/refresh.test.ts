import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GitHubClient, GitHubError } from './github.ts';
import { readGitHubStatus } from './github-status-reader.ts';
import type { GitHubStatusResult } from './github-status-reader.ts';
import { parseProjectStatus } from './project-status.ts';
import type { ProjectStatusV1 } from './project-status.ts';
import { classifyError, refreshProjects } from './refresh.ts';
import type { FailedProjectEntry } from './refresh.ts';
import { parseRegistry } from './registry.ts';
import type { Registry, RegistryProject } from './registry.ts';

const NOW = new Date('2026-09-26T08:00:00.000Z');
const now = () => NOW;
const status = (id: string): ProjectStatusV1 => ({
  schemaVersion: 1, id, name: id, summary: 'Example project',
  status: 'active', stage: 'P3', current: ['Refresh'], next: ['Dashboard'],
  publicUrl: null, updatedAt: '2026-09-01',
});
const entry = (id: string, enabled = true): RegistryProject => ({ id, repo: `owner/${id}`, enabled, statusPath: '.project/status.json' });
const registry = (...projects: RegistryProject[]): Registry => ({ version: 1, projects });
const source = (id: string) => ({ id, repo: `owner/${id}`, statusPath: '.project/status.json' });
const ok = (project: RegistryProject): GitHubStatusResult => {
  const value = status(project.id);
  return { projectId: project.id, repo: project.repo, statusPath: project.statusPath, defaultBranch: 'main', rawJson: JSON.stringify(value), status: value };
};
/** Reader stub: listed IDs fail with the given error, everything else succeeds. */
function reader(failures: Record<string, () => unknown> = {}) {
  const calls: string[] = [];
  const readStatus = async (project: RegistryProject) => {
    calls.push(project.id);
    const failure = failures[project.id];
    if (failure) throw failure();
    return ok(project);
  };
  return { readStatus, calls };
}
const metaUrl = 'https://api.github.com/repos/owner/repo';
const fileUrl = `${metaUrl}/contents/.project/status.json?ref=main`;
const httpError = (status: number, headers: Record<string, string> = {}, url = metaUrl) =>
  new GitHubError('http_error', url, new Response('secret response body', { status, headers }));
const thrown = (fn: () => unknown) => { try { fn(); } catch (error) { return error; } assert.fail('expected throw'); };

async function refreshOne(error: () => unknown) {
  const result = await refreshProjects({ registry: registry(entry('p')), readStatus: reader({ p: error }).readStatus, now });
  assert.equal(result.projects.length, 1);
  const [project] = result.projects;
  assert.ok(project && !('project' in project), 'failed entries carry no project data');
  return (project as FailedProjectEntry).sync;
}

test('one healthy project → ok with original status, source and sync', async () => {
  const result = await refreshProjects({ registry: registry(entry('a')), readStatus: reader().readStatus, now });
  assert.deepEqual(result, {
    generatedAt: NOW.toISOString(),
    projects: [{ project: status('a'), source: source('a'), sync: { state: 'ok', syncedAt: NOW.toISOString() } }],
  });
  assert.ok(!('error' in result.projects[0]!.sync));
});

test('multiple healthy projects are all ok', async () => {
  const result = await refreshProjects({ registry: registry(entry('a'), entry('b'), entry('c')), readStatus: reader().readStatus, now });
  assert.deepEqual(result.projects.map(p => [p.source.id, p.sync.state]), [['a', 'ok'], ['b', 'ok'], ['c', 'ok']]);
});

test('enabled: false is parsed by the Registry but skipped by Full Refresh', async () => {
  const parsed = parseRegistry(`version: 1
projects:
  - { id: a, repo: owner/a, enabled: true }
  - { id: off, repo: owner/off, enabled: false }
  - { id: b, repo: owner/b, enabled: true }
`);
  assert.deepEqual(parsed.projects.map(p => [p.id, p.enabled]), [['a', true], ['off', false], ['b', true]]);
  const { readStatus, calls } = reader();
  const result = await refreshProjects({ registry: parsed, readStatus, now });
  assert.deepEqual(calls.sort(), ['a', 'b']);
  assert.deepEqual(result.projects.map(p => p.source.id), ['a', 'b']);
  assert.ok(!JSON.stringify(result).includes('owner/off'));
});

test('empty or all-disabled registry yields an empty project list', async () => {
  const { readStatus, calls } = reader();
  const result = await refreshProjects({ registry: registry(entry('x', false)), readStatus, now });
  assert.deepEqual(result, { generatedAt: NOW.toISOString(), projects: [] });
  assert.equal(calls.length, 0);
});

test('one failing project does not affect the others (rejection and synchronous throw)', async () => {
  const readStatus = (project: RegistryProject) => {
    if (project.id === 'sync-throw') throw new TypeError('boom');
    if (project.id === 'reject') return Promise.reject(new GitHubError('network_error', metaUrl));
    return Promise.resolve(ok(project));
  };
  const result = await refreshProjects({ registry: registry(entry('a'), entry('reject'), entry('sync-throw'), entry('b')), readStatus, now });
  assert.deepEqual(result.projects.map(p => [p.source.id, p.sync.state]),
    [['a', 'ok'], ['reject', 'unavailable'], ['sync-throw', 'unavailable'], ['b', 'ok']]);
  assert.deepEqual(result.projects[0], { project: status('a'), source: source('a'), sync: { state: 'ok', syncedAt: NOW.toISOString() } });
  assert.deepEqual(result.projects[1], {
    source: source('reject'),
    sync: { state: 'unavailable', syncedAt: NOW.toISOString(), error: { code: 'network_error', message: 'Network error while contacting GitHub' } },
  });
});

test('result order follows Registry order, not completion order', async () => {
  const delays: Record<string, number> = { a: 30, b: 0, c: 15, d: 5 };
  const readStatus = async (project: RegistryProject) => {
    await new Promise(resolve => setTimeout(resolve, delays[project.id]));
    if (project.id === 'c') throw new GitHubError('network_error', metaUrl);
    return ok(project);
  };
  const result = await refreshProjects({ registry: registry(entry('a'), entry('b'), entry('skip', false), entry('c'), entry('d')), readStatus, now });
  assert.deepEqual(result.projects.map(p => p.source.id), ['a', 'b', 'c', 'd']);
});

test('reads run concurrently', async () => {
  let active = 0;
  let peak = 0;
  const readStatus = async (project: RegistryProject) => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return ok(project);
  };
  await refreshProjects({ registry: registry(entry('a'), entry('b'), entry('c')), readStatus, now });
  assert.equal(peak, 3);
});

test('generatedAt and syncedAt come from a single injected clock reading', async () => {
  let calls = 0;
  const clock = () => { calls++; return new Date(NOW.getTime() + calls * 1000); };
  const result = await refreshProjects({ registry: registry(entry('a'), entry('b')), readStatus: reader({ b: () => new GitHubError('network_error', metaUrl) }).readStatus, now: clock });
  assert.equal(calls, 1);
  assert.equal(result.generatedAt, '2026-09-26T08:00:01.000Z');
  assert.deepEqual(result.projects.map(p => p.sync.syncedAt), [result.generatedAt, result.generatedAt]);
});

test('Registry read failure rejects the refresh (no projects to isolate)', async () => {
  await assert.rejects(refreshProjects({ projectRoot: '/nonexistent-registry-root', readStatus: reader().readStatus, now }), { name: 'RegistryError' });
});

test('invalid JSON → invalid', async () => {
  assert.deepEqual(await refreshOne(() => thrown(() => parseProjectStatus('{'))), {
    state: 'invalid', syncedAt: NOW.toISOString(), error: { code: 'invalid_json', message: 'Status file is not valid JSON' },
  });
});

test('unsupported schemaVersion → invalid', async () => {
  for (const schemaVersion of [2, '1']) {
    const sync = await refreshOne(() => thrown(() => parseProjectStatus(JSON.stringify({ ...status('p'), schemaVersion }))));
    assert.equal(sync.state, 'invalid');
    assert.equal(sync.error.code, 'unsupported_schema_version');
  }
});

test('schema validation error → invalid with field paths but no values', async () => {
  const sync = await refreshOne(() => thrown(() => parseProjectStatus(JSON.stringify({ ...status('p'), current: [], publicUrl: 'secret-value' }))));
  assert.deepEqual(sync.error, { code: 'schema_validation', message: 'Status file does not satisfy Project Status v1 at /current, /publicUrl' });
  assert.equal(sync.state, 'invalid');
});

test('malformed Contents envelope → invalid; malformed repo metadata → unavailable', async () => {
  const content = await refreshOne(() => new GitHubError('invalid_response', fileUrl));
  assert.equal(content.state, 'invalid');
  assert.equal(content.error.code, 'invalid_response');
  const metadata = await refreshOne(() => new GitHubError('invalid_response', metaUrl));
  assert.equal(metadata.state, 'unavailable');
  assert.equal(metadata.error.code, 'invalid_response');
});

for (const code of [401, 403]) {
  test(`HTTP ${code} permission failure → unauthorized`, async () => {
    const sync = await refreshOne(() => httpError(code, { 'x-ratelimit-remaining': '42' }));
    assert.deepEqual(sync, { state: 'unauthorized', syncedAt: NOW.toISOString(),
      error: { code: 'unauthorized', message: 'GitHub denied access to the project status', httpStatus: code } });
  });
}

for (const [code, httpStatus] of [['repository_not_found', 404], ['status_file_not_found', 404]] as const) {
  test(`${code} → unavailable`, async () => {
    const sync = await refreshOne(() => new GitHubError(code, metaUrl, new Response('', { status: 404 })));
    assert.equal(sync.state, 'unavailable');
    assert.equal(sync.error.code, code);
    assert.equal(sync.error.httpStatus, httpStatus);
  });
}

test('network error → unavailable', async () => {
  const sync = await refreshOne(() => new GitHubError('network_error', metaUrl, undefined, new Error('ECONNRESET')));
  assert.deepEqual(sync.error, { code: 'network_error', message: 'Network error while contacting GitHub' });
  assert.equal(sync.state, 'unavailable');
});

for (const code of [500, 502, 503]) {
  test(`GitHub ${code} → unavailable`, async () => {
    const sync = await refreshOne(() => httpError(code));
    assert.deepEqual(sync.error, { code: 'http_error', message: `GitHub request failed with HTTP ${code}`, httpStatus: code });
    assert.equal(sync.state, 'unavailable');
  });
}

for (const [label, code, headers] of [
  ['primary 403', 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' }],
  ['secondary 403', 403, { 'retry-after': '60' }],
  ['429', 429, { 'retry-after': '30', 'x-ratelimit-reset': '1790000000' }],
] as const) {
  test(`rate limit (${label}) → unavailable, not unauthorized`, async () => {
    const sync = await refreshOne(() => httpError(code, headers));
    assert.equal(sync.state, 'unavailable');
    assert.equal(sync.error.code, 'rate_limited');
    assert.equal(sync.error.httpStatus, code);
    const expected: Record<string, string> = headers;
    assert.equal(sync.error.retryAfter, expected['retry-after']);
    assert.equal(sync.error.rateLimitReset, expected['x-ratelimit-reset']);
  });
}

test('unknown errors → unavailable with a generic message', async () => {
  const sync = await refreshOne(() => new Error('token=ghp_leak'));
  assert.deepEqual(sync.error, { code: 'unexpected_error', message: 'Unexpected error while reading project status' });
  assert.equal(sync.state, 'unavailable');
});

test('sync.error never contains credentials, headers or response bodies', async () => {
  const token = 'ghp_SECRETTOKEN1234567890';
  let captured: RequestInit | undefined;
  const client = new GitHubClient({
    token,
    fetch: async (_input, init) => {
      captured = init;
      return new Response(`{"message":"Bad credentials ${token}"}`, { status: 401, headers: { 'www-authenticate': `Bearer ${token}` } });
    },
  });
  const failures = [
    () => thrown(() => { throw new Error(`Authorization: Bearer ${token}`); }),
    () => new GitHubError('network_error', metaUrl, undefined, new Error(`Bearer ${token}`)),
    () => httpError(403, { 'x-ratelimit-remaining': '0', authorization: `Bearer ${token}` }),
  ];
  const result = await refreshProjects({
    registry: registry(entry('real'), entry('f0'), entry('f1'), entry('f2')),
    readStatus: project => project.id === 'real' ? readGitHubStatus(project, client) : Promise.reject(failures[Number(project.id[1])]!()),
    now,
  });
  assert.equal(new Headers(captured?.headers).get('Authorization'), `Bearer ${token}`, 'token was actually in play');
  assert.equal(result.projects[0]!.sync.state, 'unauthorized');
  const serialized = JSON.stringify(result);
  for (const secret of [token, 'Bearer', 'Authorization', 'Bad credentials', 'secret response body']) {
    assert.ok(!serialized.includes(secret), `leaked ${secret}`);
  }
  for (const project of result.projects) {
    assert.deepEqual(Object.keys(project.sync).sort(), ['error', 'state', 'syncedAt']);
    assert.ok(Object.keys((project.sync as { error: object }).error).every(k => ['code', 'message', 'httpStatus', 'retryAfter', 'rateLimitReset'].includes(k)));
  }
});

test('classifyError only produces the four v1 states', () => {
  const states = new Set(['ok', 'unavailable', 'unauthorized', 'invalid']);
  for (const error of [new GitHubError('network_error', metaUrl), httpError(418), 'string', null, undefined]) {
    assert.ok(states.has(classifyError(error).state));
  }
});
