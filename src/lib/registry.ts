import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseDocument } from 'yaml';

export const DEFAULT_STATUS_PATH = '.project/status.json';

export interface RegistryProject {
  id: string;
  repo: string;
  enabled: boolean;
  statusPath: string;
}

export interface Registry {
  version: 1;
  projects: RegistryProject[];
}

export class RegistryError extends Error {
  override name = 'RegistryError';
}

function mapping(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RegistryError(`${path} must be a mapping`);
  }
  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RegistryError(`${path} must be a non-empty string`);
  }
  return value;
}

function allowedFields(value: Record<string, unknown>, fields: string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) {
      throw new RegistryError(`${path}.${key} is not a Registry v1 field`);
    }
  }
}

/** Parse and validate a complete Registry v1; disabled projects are retained. */
export function parseRegistry(source: string): Registry {
  let value: unknown;
  try {
    const document = parseDocument(source, { version: '1.2', stringKeys: true });
    const issue = document.errors[0] ?? document.warnings[0];
    if (issue) throw issue;
    value = document.toJS({ maxAliasCount: 100 });
  } catch (cause) {
    throw new RegistryError('Invalid Registry YAML', { cause });
  }

  const root = mapping(value, 'registry');
  if (root.version !== 1) {
    throw new RegistryError('registry.version must be the supported integer 1');
  }
  if (!Array.isArray(root.projects)) {
    throw new RegistryError('registry.projects must be an array');
  }
  allowedFields(root, ['version', 'projects'], 'registry');

  const projects = root.projects.map((value: unknown, index: number): RegistryProject => {
    const path = `registry.projects[${index}]`;
    const project = mapping(value, path);
    allowedFields(project, ['id', 'repo', 'enabled', 'statusPath'], path);
    const id = nonemptyString(project.id, `${path}.id`);
    const repo = nonemptyString(project.repo, `${path}.repo`);
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo) || ['.', '..'].includes(repo.split('/')[1]!)) {
      throw new RegistryError(`${path}.repo must use owner/repo format`);
    }
    if (typeof project.enabled !== 'boolean') {
      throw new RegistryError(`${path}.enabled must be a boolean`);
    }
    const statusPath = Object.hasOwn(project, 'statusPath')
      ? nonemptyString(project.statusPath, `${path}.statusPath`)
      : DEFAULT_STATUS_PATH;
    return { id, repo, enabled: project.enabled, statusPath };
  });
  return { version: 1, projects };
}

/** Read registry.yaml under projectRoot (defaults to the current working directory). */
export async function readRegistry(projectRoot: string = process.cwd()): Promise<Registry> {
  const file = resolve(projectRoot, 'registry.yaml');
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (cause) {
    throw new RegistryError(`Unable to read Registry: ${file}`, { cause });
  }
  return parseRegistry(source);
}
