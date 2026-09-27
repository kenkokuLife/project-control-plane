import type { ProjectStatusV1 } from './project-status.ts';
import type { FailedProjectEntry, OkProjectEntry, RefreshResult, SyncErrorCode, SyncState } from './refresh.ts';

export type GroupKey = 'active' | 'paused' | 'closed' | 'idea';

/** One healthy project, flattened for rendering. Only allowlisted fields reach the page. */
export interface DashboardProject {
  id: string;
  name: string;
  summary: string;
  status: ProjectStatusV1['status'];
  stage: string;
  current: string[];
  next: string[];
  updatedAt: string;
  /** Only http(s) URLs; anything else (including null) renders no link. */
  publicUrl: string | null;
  repo: string;
  repoUrl: string;
  syncState: 'ok';
}

/** One Registry project whose status could not be read. No business fields are invented. */
export interface DashboardIssue {
  id: string;
  repo: string;
  repoUrl: string;
  statusPath: string;
  state: Exclude<SyncState, 'ok'>;
  code: SyncErrorCode;
  message: string;
  httpStatus: number | null;
  syncedAt: string;
}

export interface DashboardGroup {
  key: GroupKey;
  title: string;
  projects: DashboardProject[];
}

export interface DashboardView {
  generatedAt: string;
  counts: { total: number; ok: number; issues: number };
  /** Non-empty groups only, in fixed order: Active, Paused, Completed / Archived, Idea. */
  groups: DashboardGroup[];
  issues: DashboardIssue[];
}

const GROUPS: { key: GroupKey; title: string; statuses: ProjectStatusV1['status'][] }[] = [
  { key: 'active', title: 'Active', statuses: ['active'] },
  { key: 'paused', title: 'Paused', statuses: ['paused'] },
  { key: 'closed', title: 'Completed / Archived', statuses: ['completed', 'archived'] },
  { key: 'idea', title: 'Idea', statuses: ['idea'] },
];

export const STATUS_LABELS: Record<ProjectStatusV1['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
  idea: 'Idea',
};

export function repoUrl(repo: string): string {
  return `https://github.com/${repo.split('/').map(encodeURIComponent).join('/')}`;
}

/** Returns the URL only when it is an absolute http(s) URL; guards against javascript: and friends. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** Formats an ISO timestamp as `YYYY-MM-DD HH:mm UTC`; static output, so no relative times. */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function toProject({ project, source }: OkProjectEntry): DashboardProject {
  return {
    id: source.id,
    name: project.name,
    summary: project.summary,
    status: project.status,
    stage: project.stage,
    current: project.current,
    next: project.next,
    updatedAt: project.updatedAt,
    publicUrl: safeHttpUrl(project.publicUrl),
    repo: source.repo,
    repoUrl: repoUrl(source.repo),
    syncState: 'ok',
  };
}

function toIssue({ source, sync }: FailedProjectEntry): DashboardIssue {
  // Pick fields explicitly: never spread the error, so nothing beyond code/message/status can leak.
  return {
    id: source.id,
    repo: source.repo,
    repoUrl: repoUrl(source.repo),
    statusPath: source.statusPath,
    state: sync.state,
    code: sync.error.code,
    message: sync.error.message,
    httpStatus: sync.error.httpStatus ?? null,
    syncedAt: sync.syncedAt,
  };
}

/** Turn a Full Refresh result into the Dashboard view. Order within each group follows the Registry. */
export function buildDashboard(result: RefreshResult): DashboardView {
  const projects: DashboardProject[] = [];
  const issues: DashboardIssue[] = [];
  for (const entry of result.projects) {
    if ('project' in entry && entry.sync.state === 'ok') projects.push(toProject(entry as OkProjectEntry));
    else issues.push(toIssue(entry as FailedProjectEntry));
  }
  const groups = GROUPS
    .map(({ key, title, statuses }) => ({ key, title, projects: projects.filter(p => statuses.includes(p.status)) }))
    .filter(group => group.projects.length > 0);
  return {
    generatedAt: result.generatedAt,
    counts: { total: result.projects.length, ok: projects.length, issues: issues.length },
    groups,
    issues,
  };
}
