import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readGitHubStatus } from './github-status-reader.ts';

test('public GitHub repository status passes canonical v1 validation without a token', { timeout: 40_000 }, async t => {
  const result = await readGitHubStatus({
    id: 'project-control-plane', repo: 'kenkokuLife/project-control-plane',
    enabled: true, statusPath: '.project/status.json',
  });
  assert.equal(result.status.schemaVersion, 1);
  assert.equal(result.status.id, 'project-control-plane');
  assert.ok(result.rawJson.length > 0);
  t.diagnostic(`repo=${result.repo} defaultBranch=${result.defaultBranch} updatedAt=${result.status.updatedAt}`);
});
