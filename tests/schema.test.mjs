import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const bytes = readFileSync(new URL('../schemas/project-status-v1.schema.json', import.meta.url));
const schema = JSON.parse(bytes);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = {
  schemaVersion: 1, id: 'example', name: 'Example', summary: 'Example project',
  status: 'active', stage: 'implementation', current: ['Ready'], next: ['Continue'],
  publicUrl: null, updatedAt: '2024-02-29',
};

test('canonical v1 is byte-identical to the frozen Skill baseline', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '38476a634281876ad084c554cc6b9b95df5338d0f879744611f14b423d03f778');
});
test('schema passes draft 2020-12 meta-schema validation', () => {
  assert.equal(ajv.validateSchema(schema), true);
});
test('accepts a complete status and the repository status', () => {
  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.equal(validate(JSON.parse(readFileSync(new URL('../.project/status.json', import.meta.url)))), true, JSON.stringify(validate.errors));
});
for (const status of ['idea', 'active', 'paused', 'completed', 'archived']) {
  test(`accepts status ${status}`, () => assert.equal(validate({ ...valid, status }), true));
}
for (const key of Object.keys(valid)) {
  test(`requires ${key}`, () => {
    const value = { ...valid };
    delete value[key];
    assert.equal(validate(value), false);
  });
}
for (const [key, values] of Object.entries({
  schemaVersion: [0, 2, '1', null], id: ['', '  ', 1], name: ['', '  ', null],
  summary: ['', '  ', false], stage: ['', '  ', 1], status: ['unknown', null],
  current: [[], [''], ['  '], 'text', [1]], next: [[], [''], ['  '], 'text', [null]],
  publicUrl: ['', 'not a uri', 1], updatedAt: ['2023-02-29', '2026-13-01', '2026-09-26T00:00:00Z', '2026-9-26', null],
})) {
  for (const value of values) test(`rejects ${key} = ${JSON.stringify(value)}`, () => {
    assert.equal(validate({ ...valid, [key]: value }), false);
  });
}
test('accepts a URI and rejects extra properties and non-object roots', () => {
  assert.equal(validate({ ...valid, publicUrl: 'https://example.com/' }), true);
  for (const value of [{ ...valid, extra: true }, null, [], 'text']) assert.equal(validate(value), false);
});
test('copy comparison accepts equivalent JSON and fails on drift, missing files and invalid JSON', () => {
  const directory = mkdtempSync(new URL('../.schema-test-', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-schema-copy.mjs', import.meta.url)), ...args], { encoding: 'utf8' });
  try {
    const path = `${directory}/copy.json`;
    writeFileSync(path, JSON.stringify(schema));
    assert.equal(run(path).status, 0);
    writeFileSync(path, JSON.stringify({ ...schema, additionalProperties: true }));
    assert.equal(run(path).status, 1);
    writeFileSync(path, '{');
    assert.equal(run(path).status, 1);
    assert.equal(run(`${directory}/missing.json`).status, 1);
    assert.equal(run().status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
