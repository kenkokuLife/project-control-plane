import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { refreshProjects } from './refresh.ts';

test('Full Refresh of the repository registry reads the public project without a token', { timeout: 40_000 }, async t => {
  const result = await refreshProjects({ projectRoot: fileURLToPath(new URL('../../', import.meta.url)) });
  t.diagnostic(JSON.stringify(result.projects.map(p => ({ ...p.source, ...p.sync }))));
  assert.equal(result.projects.length, 1);
  const [entry] = result.projects;
  assert.equal(entry!.source.id, 'project-control-plane');
  assert.equal(entry!.sync.state, 'ok');
  assert.ok('project' in entry! && entry.project.id === 'project-control-plane');
});
