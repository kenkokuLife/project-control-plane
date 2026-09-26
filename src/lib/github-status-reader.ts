import { GitHubClient } from './github.ts';
import { parseProjectStatus } from './project-status.ts';
import type { ProjectStatusV1 } from './project-status.ts';
import type { RegistryProject } from './registry.ts';

export interface GitHubStatusResult {
  projectId: string;
  repo: string;
  statusPath: string;
  defaultBranch: string;
  rawJson: string;
  status: ProjectStatusV1;
}

/** Read one project; scheduling, enabled filtering and error mapping belong to P3. */
export async function readGitHubStatus(
  project: RegistryProject,
  github: Pick<GitHubClient, 'getDefaultBranch' | 'readFile'> = new GitHubClient(),
): Promise<GitHubStatusResult> {
  const defaultBranch = await github.getDefaultBranch(project.repo);
  const rawJson = await github.readFile(project.repo, project.statusPath, defaultBranch);
  const status = parseProjectStatus(rawJson);
  return { projectId: project.id, repo: project.repo, statusPath: project.statusPath, defaultBranch, rawJson, status };
}
