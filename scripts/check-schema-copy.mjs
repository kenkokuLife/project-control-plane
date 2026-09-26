import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

// Explicit local path only: never fetches or writes to the Skill repository.
const [copyPath, ...extra] = process.argv.slice(2);
if (!copyPath || extra.length) {
  console.error('Usage: pnpm schema:compare <path-to-skill-schema>');
  process.exitCode = 1;
} else {
  try {
    const canonical = JSON.parse(readFileSync(new URL('../schemas/project-status-v1.schema.json', import.meta.url), 'utf8'));
    const copy = JSON.parse(readFileSync(copyPath, 'utf8'));
    if (!isDeepStrictEqual(canonical, copy)) throw new Error('Schema drift detected; do not change frozen v1 to reconcile differing contracts');
    console.log('Schema copy matches canonical v1 (JSON content; formatting ignored).');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
