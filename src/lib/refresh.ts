import { GitHubClient, GitHubError } from './github.ts';
import { readGitHubStatus } from './github-status-reader.ts';
import type { GitHubStatusResult } from './github-status-reader.ts';
import { ProjectStatusParseError, ProjectStatusValidationError } from './project-status.ts';
import type { ProjectStatusV1 } from './project-status.ts';
import { readRegistry } from './registry.ts';
import type { Registry, RegistryProject } from './registry.ts';

export type SyncState = 'ok' | 'unavailable' | 'unauthorized' | 'invalid';

export type SyncErrorCode =
  | 'repository_not_found'
  | 'status_file_not_found'
  | 'network_error'
  | 'rate_limited'
  | 'unauthorized'
  | 'http_error'
  | 'invalid_response'
  | 'invalid_json'
  | 'unsupported_schema_version'
  | 'schema_validation'
  | 'unexpected_error';

/** Safe, structured failure detail. Never carries tokens, headers or response bodies. */
export interface SyncError {
  code: SyncErrorCode;
  message: string;
  httpStatus?: number;
  retryAfter?: string;
  rateLimitReset?: string;
}

export interface ProjectSource {
  id: string;
  repo: string;
  statusPath: string;
}

export interface OkProjectEntry {
  project: ProjectStatusV1;
  source: ProjectSource;
  sync: { state: 'ok'; syncedAt: string };
}

export interface FailedProjectEntry {
  source: ProjectSource;
  sync: { state: Exclude<SyncState, 'ok'>; syncedAt: string; error: SyncError };
}

export type ProjectEntry = OkProjectEntry | FailedProjectEntry;

export interface RefreshResult {
  generatedAt: string;
  projects: ProjectEntry[];
}

export interface RefreshOptions {
  /** Already-parsed Registry; when omitted, registry.yaml is read from projectRoot. */
  registry?: Registry;
  projectRoot?: string;
  /** Single-project reader (P2); injectable for tests. */
  readStatus?: (project: RegistryProject) => Promise<GitHubStatusResult>;
  /** Clock for generatedAt / syncedAt; injectable for tests. */
  now?: () => Date;
}

type Failure = { state: Exclude<SyncState, 'ok'>; error: SyncError };

function httpFailure(error: GitHubError): Failure {
  const status = error.status!;
  const detail: Pick<SyncError, 'httpStatus' | 'retryAfter' | 'rateLimitReset'> = {
    httpStatus: status,
    ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    ...(error.rateLimitReset ? { rateLimitReset: error.rateLimitReset } : {}),
  };
  // GitHub signals primary rate limits with 403/429 + x-ratelimit-remaining: 0 and
  // secondary rate limits with 403/429 + retry-after; neither is a permission problem.
  const rateLimited = status === 429 || (status === 403 && (error.rateLimitRemaining === '0' || error.retryAfter !== null));
  if (rateLimited) {
    return { state: 'unavailable', error: { code: 'rate_limited', message: 'GitHub API rate limit exceeded', ...detail } };
  }
  if (status === 401 || status === 403) {
    return { state: 'unauthorized', error: { code: 'unauthorized', message: 'GitHub denied access to the project status', ...detail } };
  }
  return { state: 'unavailable', error: { code: 'http_error', message: `GitHub request failed with HTTP ${status}`, ...detail } };
}

/** Map a P2 failure onto the four v1 sync states. Messages are fixed text, never upstream output. */
export function classifyError(error: unknown): Failure {
  if (error instanceof GitHubError) {
    switch (error.code) {
      case 'repository_not_found':
        return { state: 'unavailable', error: { code: error.code, message: 'GitHub repository was not found or is not visible', httpStatus: 404 } };
      case 'status_file_not_found':
        return { state: 'unavailable', error: { code: error.code, message: 'Status file was not found on the default branch', httpStatus: 404 } };
      case 'network_error':
        return { state: 'unavailable', error: { code: error.code, message: 'Network error while contacting GitHub' } };
      case 'http_error':
        return httpFailure(error);
      case 'invalid_response':
        // Repository metadata anomalies mean the source could not be located; a malformed
        // Contents envelope means the repo/file exist but the file content is unusable.
        return new URL(error.url).pathname.includes('/contents/')
          ? { state: 'invalid', error: { code: error.code, message: 'Status file content is not a readable UTF-8 file' } }
          : { state: 'unavailable', error: { code: error.code, message: 'GitHub returned unexpected repository metadata' } };
    }
  }
  if (error instanceof ProjectStatusParseError) {
    return { state: 'invalid', error: { code: 'invalid_json', message: 'Status file is not valid JSON' } };
  }
  if (error instanceof ProjectStatusValidationError) {
    if (error.issues.some(issue => issue.instancePath === '/schemaVersion')) {
      return { state: 'invalid', error: { code: 'unsupported_schema_version', message: 'Status file schemaVersion is not the supported value 1' } };
    }
    const paths = [...new Set(error.issues.map(issue => issue.instancePath || '/'))].slice(0, 5);
    return { state: 'invalid', error: { code: 'schema_validation', message: `Status file does not satisfy Project Status v1 at ${paths.join(', ')}` } };
  }
  return { state: 'unavailable', error: { code: 'unexpected_error', message: 'Unexpected error while reading project status' } };
}

/**
 * Full Refresh: read every enabled Registry project concurrently and aggregate the results.
 * Per-project failures become failed entries; only a Registry read failure rejects.
 * Nothing is written to disk.
 */
export async function refreshProjects(options: RefreshOptions = {}): Promise<RefreshResult> {
  const registry = options.registry ?? await readRegistry(options.projectRoot);
  const client = options.readStatus ? undefined : new GitHubClient();
  const readStatus = options.readStatus ?? ((project: RegistryProject) => readGitHubStatus(project, client));
  const timestamp = (options.now ?? (() => new Date()))().toISOString();

  const projects = await Promise.all(registry.projects
    .filter(project => project.enabled)
    .map(async (project): Promise<ProjectEntry> => {
      const source = { id: project.id, repo: project.repo, statusPath: project.statusPath };
      try {
        const result = await readStatus(project);
        return { project: result.status, source, sync: { state: 'ok', syncedAt: timestamp } };
      } catch (error) {
        const { state, error: detail } = classifyError(error);
        return { source, sync: { state, syncedAt: timestamp, error: detail } };
      }
    }));
  return { generatedAt: timestamp, projects };
}
