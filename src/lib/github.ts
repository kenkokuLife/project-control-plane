export type GitHubErrorCode =
  | 'repository_not_found'
  | 'status_file_not_found'
  | 'network_error'
  | 'http_error'
  | 'invalid_response';

export class GitHubError extends Error {
  override name = 'GitHubError';
  readonly code: GitHubErrorCode;
  readonly url: string;
  readonly status: number | undefined;
  readonly retryAfter: string | null;
  readonly rateLimitRemaining: string | null;
  readonly rateLimitReset: string | null;

  constructor(code: GitHubErrorCode, url: string, response?: Response, cause?: unknown) {
    super(`GitHub ${code}${response ? ` (HTTP ${response.status})` : ''}: ${url}`, { cause });
    this.code = code;
    this.url = url;
    this.status = response?.status;
    this.retryAfter = response?.headers.get('retry-after') ?? null;
    this.rateLimitRemaining = response?.headers.get('x-ratelimit-remaining') ?? null;
    this.rateLimitReset = response?.headers.get('x-ratelimit-reset') ?? null;
  }
}

export interface GitHubClientOptions {
  token?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Public GitHub REST client. Authentication is optional and confined to transport. */
export class GitHubClient {
  private readonly request: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: GitHubClientOptions = {}) {
    this.request = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'project-control-plane',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    };
  }

  private repoUrl(repo: string): string {
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo) || ['.', '..'].includes(repo.split('/')[1]!)) {
      throw new TypeError('repo must use owner/repo format');
    }
    return `https://api.github.com/repos/${repo}`;
  }

  private async json(url: string, missing: GitHubErrorCode): Promise<unknown> {
    let response: Response;
    let text: string;
    try {
      response = await this.request(url, { headers: this.headers, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (cause) {
      throw new GitHubError('network_error', url, undefined, cause);
    }
    if (!response.ok) throw new GitHubError(response.status === 404 ? missing : 'http_error', url, response);
    try {
      text = await response.text();
    } catch (cause) {
      throw new GitHubError('network_error', url, response, cause);
    }
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new GitHubError('invalid_response', url, response, cause);
    }
  }

  async getDefaultBranch(repo: string): Promise<string> {
    const url = this.repoUrl(repo);
    const data = await this.json(url, 'repository_not_found');
    if (!object(data) || typeof data.default_branch !== 'string' || !data.default_branch.trim()) {
      throw new GitHubError('invalid_response', url);
    }
    return data.default_branch;
  }

  /** Decode the Contents API's file envelope into the original UTF-8 JSON text. */
  async readFile(repo: string, path: string, branch: string): Promise<string> {
    const segments = path.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new TypeError('statusPath must be a repository-relative file path without dot segments');
    }
    const url = `${this.repoUrl(repo)}/contents/${segments.map(encodeURIComponent).join('/')}?${new URLSearchParams({ ref: branch })}`;
    const data = await this.json(url, 'status_file_not_found');
    if (!object(data) || data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') {
      throw new GitHubError('invalid_response', url);
    }
    const encoded = data.content.replace(/[\r\n]/g, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new GitHubError('invalid_response', url);
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (cause) {
      throw new GitHubError('invalid_response', url, undefined, cause);
    }
  }
}
