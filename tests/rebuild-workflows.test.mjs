import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const dailyFile = new URL('../.github/workflows/daily-rebuild.yml', import.meta.url);
const projectFile = new URL('../examples/project-status-deploy-hook.yml', import.meta.url);

function workflow(file) {
  const source = readFileSync(file, 'utf8');
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  assert.deepEqual(document.errors, [], `${file.pathname} must be valid YAML`);
  return { source, data: document.toJS() };
}

function assertSafeHookStep({ source, data }) {
  assert.deepEqual(data.permissions, {});
  const steps = data.jobs['trigger-rebuild'].steps;
  assert.equal(steps.length, 1);
  const step = steps[0];
  assert.equal(step.env.CONTROL_PLANE_DEPLOY_HOOK, '${{ secrets.CONTROL_PLANE_DEPLOY_HOOK }}');
  assert.match(step.run, /-z "\$CONTROL_PLANE_DEPLOY_HOOK"/);
  assert.match(step.run, /--request POST "\$CONTROL_PLANE_DEPLOY_HOOK"/);
  assert.match(step.run, /--fail\b/);
  assert.match(step.run, /--output \/dev\/null/);
  assert.match(step.run, /2>\/dev\/null/);
  assert.doesNotMatch(step.run, /set -x|echo\s+.*\$CONTROL_PLANE_DEPLOY_HOOK|curl\s+.*--verbose/);
  assert.doesNotMatch(source, /https?:\/\/[^\s]+(?:deploy_hook|deploy-hook)/i);
}

test('other-project template only reacts to main status changes', () => {
  const parsed = workflow(projectFile);
  assert.deepEqual(parsed.data.on, {
    push: { branches: ['main'], paths: ['.project/status.json'] },
  });
  assertSafeHookStep(parsed);
});

test('daily rebuild and manual dispatch share the protected hook', () => {
  const parsed = workflow(dailyFile);
  assert.deepEqual(parsed.data.on, {
    schedule: [{ cron: '17 0 * * *' }],
    workflow_dispatch: null,
  });
  assertSafeHookStep(parsed);
});
