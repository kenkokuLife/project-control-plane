import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseRegistry, readRegistry, RegistryError } from './registry.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = { id: 'stable-id', repo: 'owner/repo', enabled: true };
const registry = (entry: unknown = project) => JSON.stringify({ version: 1, projects: [entry] });

test('reads the repository registry and supplies the default statusPath', async () => {
  assert.deepEqual(await readRegistry(root), {
    version: 1,
    projects: [{ id: 'project-control-plane', repo: 'kenkokuLife/project-control-plane', enabled: true, statusPath: '.project/status.json' }],
  });
  assert.deepEqual(await readRegistry(), await readRegistry(root));
});

test('retains disabled projects, stable IDs and explicit status paths', () => {
  assert.deepEqual(parseRegistry(registry({ ...project, enabled: false, statusPath: 'metadata/status.json' })).projects[0], {
    ...project, enabled: false, statusPath: 'metadata/status.json',
  });
});

test('accepts an empty project list', () => {
  assert.deepEqual(parseRegistry('version: 1\nprojects: []'), { version: 1, projects: [] });
});

for (const version of [undefined, 2, '1', 1.5, null, true]) {
  test(`rejects unsupported or missing version ${String(version)}`, () => {
    assert.throws(() => parseRegistry(JSON.stringify({ version, projects: [] })), /registry.version/);
  });
}

for (const field of ['id', 'repo', 'enabled'] as const) {
  test(`rejects missing ${field}`, () => {
    const entry: Record<string, unknown> = { ...project };
    delete entry[field];
    assert.throws(() => parseRegistry(registry(entry)), new RegExp(`projects\\[0\\].${field}`));
  });
}

for (const field of ['id', 'repo', 'statusPath'] as const) {
  for (const value of ['', '  ', null, 42]) {
    test(`rejects invalid ${field}: ${JSON.stringify(value)}`, () => {
      assert.throws(() => parseRegistry(registry({ ...project, [field]: value })), new RegExp(`\\.${field}`));
    });
  }
}

for (const repo of ['repo', '/repo', 'owner/', 'owner/repo/extra', 'owner /repo', 'https://github.com/owner/repo', 'owner/..']) {
  test(`rejects malformed repo ${repo}`, () => {
    assert.throws(() => parseRegistry(registry({ ...project, repo })), /owner\/repo/);
  });
}

for (const enabled of ['true', 'false', 0, 1, null]) {
  test(`rejects non-boolean enabled ${JSON.stringify(enabled)}`, () => {
    assert.throws(() => parseRegistry(registry({ ...project, enabled })), /enabled must be a boolean/);
  });
}

for (const source of ['', '[]', 'version: 1', 'version: 1\nprojects: {}', 'version: 1\nprojects: [null]']) {
  test(`rejects invalid structure ${JSON.stringify(source)}`, () => {
    assert.throws(() => parseRegistry(source), RegistryError);
  });
}

for (const source of ['version: [', 'version: 1\nversion: 1\nprojects: []', 'version: 1\nprojects: []\n---\nversion: 1']) {
  test(`rejects malformed, duplicate-key or multi-document YAML ${JSON.stringify(source)}`, () => {
    assert.throws(() => parseRegistry(source), /Invalid Registry YAML/);
  });
}

for (const field of ['name', 'summary', 'status', 'stage', 'current', 'next', 'publicUrl']) {
  test(`rejects status field ${field} in Registry`, () => {
    assert.throws(() => parseRegistry(registry({ ...project, [field]: 'value' })), /not a Registry v1 field/);
  });
}

test('reads an explicit project root and reports filesystem and YAML errors', async () => {
  const directory = await mkdtemp(`${root}.registry-test-`);
  try {
    await assert.rejects(readRegistry(directory), /Unable to read Registry/);
    await writeFile(`${directory}/registry.yaml`, registry());
    assert.equal((await readRegistry(directory)).projects[0]?.id, 'stable-id');
    await writeFile(`${directory}/registry.yaml`, 'version: [');
    await assert.rejects(readRegistry(directory), /Invalid Registry YAML/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
