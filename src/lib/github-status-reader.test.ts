import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GitHubClient, GitHubError } from './github.ts';
import { readGitHubStatus } from './github-status-reader.ts';
import { parseProjectStatus, ProjectStatusParseError, ProjectStatusValidationError } from './project-status.ts';

const project = { id: 'registry-id', repo: 'owner/repo', enabled: true, statusPath: '.project/status.json' };
const valid = {
  schemaVersion: 1, id: 'status-id', name: '项目', summary: 'Example project',
  status: 'active', stage: 'P2', current: ['Read'], next: ['Refresh'],
  publicUrl: null, updatedAt: '2024-02-29',
};
const json = (value: unknown) => new Response(JSON.stringify(value));
const file = (text = JSON.stringify(valid)) => json({ type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') + '\n' });
function stub(responses: Response[]) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    assert.ok(responses.length, 'unexpected HTTP request');
    return responses.shift()!;
  };
  return { client: new GitHubClient({ fetch }), calls, fetch };
}
const isGitHubError = (code: string, status?: number) => (error: unknown) => {
  assert.ok(error instanceof GitHubError);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
};

test('reads valid status using the discovered default branch and returns raw text', async () => {
  const { client, calls } = stub([json({ default_branch: 'release/current+#' }), file()]);
  const result = await readGitHubStatus(project, client);
  assert.deepEqual(result, { projectId: project.id, repo: project.repo, statusPath: project.statusPath,
    defaultBranch: 'release/current+#', rawJson: JSON.stringify(valid), status: valid });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.url.href, 'https://api.github.com/repos/owner/repo');
  assert.equal(calls[1]!.url.pathname, '/repos/owner/repo/contents/.project/status.json');
  assert.equal(calls[1]!.url.searchParams.get('ref'), 'release/current+#');
  const headers = new Headers(calls[0]!.init?.headers);
  assert.equal(headers.has('Authorization'), false);
  assert.equal(headers.get('X-GitHub-Api-Version'), '2022-11-28');
});

test('supports custom status paths with URL-sensitive characters', async () => {
  const { client, calls } = stub([json({ default_branch: 'trunk' }), file()]);
  await readGitHubStatus({ ...project, statusPath: 'meta data/status#?.json' }, client);
  assert.equal(calls[1]!.url.pathname, '/repos/owner/repo/contents/meta%20data/status%23%3F.json');
});

test('optional token is a transport setting', async () => {
  const { fetch, calls } = stub([json({ default_branch: 'main' })]);
  await new GitHubClient({ fetch, token: 'test-token' }).getDefaultBranch(project.repo);
  assert.equal(new Headers(calls[0]!.init?.headers).get('Authorization'), 'Bearer test-token');
});

for (const [code, responses] of [
  ['repository_not_found', [new Response('', { status: 404 })]],
  ['status_file_not_found', [json({ default_branch: 'main' }), new Response('', { status: 404 })]],
] as const) {
  test(code, async () => {
    const { client } = stub([...responses]);
    await assert.rejects(readGitHubStatus(project, client), isGitHubError(code, 404));
  });
}
for (const status of [401, 403, 429, 500, 503]) {
  test(`preserves HTTP ${status} and rate-limit details`, async () => {
    const { client } = stub([new Response('', { status, headers: { 'retry-after': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '123' } })]);
    await assert.rejects(readGitHubStatus(project, client), error => {
      isGitHubError('http_error', status)(error);
      assert.equal((error as GitHubError).retryAfter, '60');
      assert.equal((error as GitHubError).rateLimitRemaining, '0');
      assert.equal((error as GitHubError).rateLimitReset, '123');
      return true;
    });
  });
}

test('classifies network rejection and preserves cause', async () => {
  const cause = new Error('offline');
  const client = new GitHubClient({ fetch: async () => { throw cause; } });
  await assert.rejects(readGitHubStatus(project, client), error => {
    isGitHubError('network_error')(error);
    assert.equal((error as Error).cause, cause);
    return true;
  });
});

test('classifies response body interruption as network error', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('interrupted')); } }));
  await assert.rejects(readGitHubStatus(project, stub([response]).client), isGitHubError('network_error', 200));
});

for (const data of [null, [], {}, { default_branch: 1 }, { default_branch: '' }]) {
  test(`rejects malformed metadata ${JSON.stringify(data)}`, async () => {
    await assert.rejects(readGitHubStatus(project, stub([json(data)]).client), isGitHubError('invalid_response'));
  });
}

test('distinguishes malformed API JSON from malformed status JSON', async () => {
  await assert.rejects(readGitHubStatus(project, stub([new Response('{')]).client), isGitHubError('invalid_response', 200));
  await assert.rejects(readGitHubStatus(project, stub([json({ default_branch: 'main' }), file('{')]).client), ProjectStatusParseError);
});

for (const data of [null, [], {}, { type: 'dir' }, { type: 'file', encoding: 'none', content: '' },
  { type: 'file', encoding: 'base64', content: 1 }, { type: 'file', encoding: 'base64', content: '!!!!' },
  { type: 'file', encoding: 'base64', content: '/w==' }]) {
  test(`rejects malformed file envelope ${JSON.stringify(data)}`, async () => {
    await assert.rejects(readGitHubStatus(project, stub([json({ default_branch: 'main' }), json(data)]).client), isGitHubError('invalid_response'));
  });
}

for (const change of [{ schemaVersion: 2 }, { schemaVersion: '1' }, { current: [] }, { updatedAt: '2023-02-29' }, { publicUrl: 'invalid' }, { extra: true }]) {
  test(`schema failure ${JSON.stringify(change)}`, async () => {
    await assert.rejects(readGitHubStatus(project, stub([json({ default_branch: 'main' }), file(JSON.stringify({ ...valid, ...change }))]).client), error => {
      assert.ok(error instanceof ProjectStatusValidationError);
      assert.ok(error.issues.length);
      return true;
    });
  });
}

test('validation issues remain stable across later validation calls', () => {
  let first: ProjectStatusValidationError;
  try { parseProjectStatus('{}'); } catch (error) { assert.ok(error instanceof ProjectStatusValidationError); first = error; }
  const saved = structuredClone(first!.issues);
  assert.throws(() => parseProjectStatus('null'), ProjectStatusValidationError);
  assert.deepEqual(first!.issues, saved);
  assert.deepEqual(parseProjectStatus(JSON.stringify(valid)), valid);
});

test('rejects unsafe paths before sending file requests', async () => {
  for (const path of ['/status.json', '../status.json', 'a/../status.json', 'a//b']) {
    const { client, calls } = stub([]);
    await assert.rejects(client.readFile(project.repo, path, 'main'), TypeError);
    assert.equal(calls.length, 0);
  }
});
