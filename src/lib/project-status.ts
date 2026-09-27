import { Ajv2020 } from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import type { ErrorObject } from 'ajv';
// Static JSON import (not a runtime path lookup) so the schema also resolves inside the Astro/Vite build.
import schema from '../../schemas/project-status-v1.schema.json' with { type: 'json' };

export interface ProjectStatusV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  summary: string;
  status: 'idea' | 'active' | 'paused' | 'completed' | 'archived';
  stage: string;
  current: string[];
  next: string[];
  publicUrl: string | null;
  updatedAt: string;
}

export class ProjectStatusParseError extends Error {
  override name = 'ProjectStatusParseError';
  readonly code = 'invalid_json';
}

export class ProjectStatusValidationError extends Error {
  override name = 'ProjectStatusValidationError';
  readonly code = 'schema_validation';
  readonly issues: ErrorObject[];

  constructor(issues: ErrorObject[]) {
    super('Project status does not satisfy the canonical v1 schema');
    this.issues = structuredClone(issues);
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
formats.default(ajv);
const validate = ajv.compile<ProjectStatusV1>(schema);

export function parseProjectStatus(source: string): ProjectStatusV1 {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    throw new ProjectStatusParseError('Unable to parse project status JSON', { cause });
  }
  if (!validate(value)) throw new ProjectStatusValidationError(validate.errors ?? []);
  return value;
}
