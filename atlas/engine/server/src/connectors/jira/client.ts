import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { refreshJiraToken, fetchUserJiraTokens } from './storage.js';

export interface JiraClientOptions {
  cloudId: string;
  accessToken: string;
  jiraDomain?: string | null;
}

const BASE_URL = 'https://api.atlassian.com/ex/jira';

export class JiraClient {
  private client: AxiosInstance;
  private cloudId: string;
  private jiraDomain?: string | null;

  constructor({ accessToken, cloudId, jiraDomain }: JiraClientOptions & { accessToken: string }) {
    this.cloudId = cloudId;
    this.jiraDomain = jiraDomain;
    let baseURL = `${BASE_URL}/${cloudId}`;
    if (baseURL.includes('api.atlassian.com/jira/')) {
      console.warn('[JiraClient] Normalizing baseURL to ex/jira', baseURL);
      baseURL = baseURL.replace('api.atlassian.com/jira/', 'api.atlassian.com/ex/jira/');
    }
    // Safety: collapse accidental double jira/ prefix
    baseURL = baseURL.replace('/jira/jira/', '/jira/');
    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
  }

  static async fromUser(orgId: string, forgeUserId: string) {
    const token = await fetchUserJiraTokens(orgId, forgeUserId);
    if (!token || !token.cloud_id) throw new Error('Jira not connected for this user');
    const now = Date.now();
    const expiresAt = token.expires_at instanceof Date ? token.expires_at.getTime() : new Date(token.expires_at).getTime();
    const shouldRefresh = !expiresAt || expiresAt - now < 5 * 60 * 1000;
    let activeToken: any = token;
    if (shouldRefresh) {
      const refreshed = await refreshJiraToken(orgId, forgeUserId);
      if (refreshed) activeToken = refreshed;
    }
    return new JiraClient({
      cloudId: activeToken.cloud_id!,
      accessToken: activeToken.access_token,
      jiraDomain: activeToken.jira_domain ?? null
    });
  }

  static async fromTokens(tokens: any, orgId?: string, forgeUserId?: string) {
    let active = tokens;
    const expiresAt = tokens?.expires_at ? new Date(tokens.expires_at).getTime() : null;
    const shouldRefresh =
      orgId &&
      forgeUserId &&
      expiresAt !== null &&
      expiresAt - Date.now() < 5 * 60 * 1000 &&
      tokens?.refresh_token;
    if (shouldRefresh) {
      const refreshed = await refreshJiraToken(orgId!, forgeUserId!);
      if (refreshed) {
        active = refreshed;
      }
    }
    if (!active?.access_token || !active?.cloud_id) {
      throw new Error('Missing Jira access_token or cloud_id');
    }
    return new JiraClient({
      accessToken: active.access_token,
      cloudId: active.cloud_id,
      jiraDomain: active.jira_domain ?? null
    });
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    const maxRetries = 3;
    let attempt = 0;
    let lastError: any;
    while (attempt < maxRetries) {
      try {
        const res = await this.client.request<T>(config);
        return res.data;
      } catch (error: any) {
        lastError = error;
        const status = error?.response?.status;
        if (status === 410) {
          console.warn('[JiraClient] 410 Gone response', {
            url: error?.config?.url || config.url,
            data: error?.response?.data,
          });
        }
        if (status === 429 || status >= 500) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  // Projects
  getProjects() {
    return this.request<{ values: any[] }>({ url: '/rest/api/3/project/search', method: 'GET' });
  }

  getProject(projectIdOrKey: string) {
    return this.request<any>({ url: `/rest/api/3/project/${projectIdOrKey}`, method: 'GET' });
  }

  // Issues
getAssignedIssues(accountId?: string) {
  const jql = accountId
    ? `assignee = "${accountId}" ORDER BY updated DESC`
    : `assignee = currentUser() ORDER BY updated DESC`;

  return this.request<{ issues: any[] }>({
    url: '/rest/api/3/search/jql',
    method: 'POST',
    data: {
      jql,
      maxResults: 250,
      fields: [
        "summary",
        "status",
        "priority",
        "assignee",
        "created",
        "updated"
      ]
    }
  });
}

searchIssues(params: { jql?: string; query?: string; status?: string; assignee?: string }) {
  const clauses: string[] = [];
  if (params.jql) clauses.push(params.jql);
  if (params.query) clauses.push(`text ~ "${params.query}"`);
  if (params.status) clauses.push(`status = "${params.status}"`);
  if (params.assignee) clauses.push(`assignee = "${params.assignee}"`);

  const jql = clauses.length ? clauses.join(' AND ') : 'ORDER BY updated DESC';

  return this.request<{ issues: any[] }>({
    url: '/rest/api/3/search/jql',
    method: 'POST',
    data: {
      jql,
      maxResults: 250,
      fields: [
        "summary",
        "status",
        "priority",
        "assignee",
        "created",
        "updated"
      ]
    }
  });
}

  getIssue(issueKey: string) {
    return this.request<any>({
      url: `/rest/api/3/issue/${issueKey}`,
      method: 'GET',
      params: {
        expand: 'renderedFields,transitions,changelog'
      }
    });
  }

  createIssue(payload: any) {
    return this.request<any>({ url: '/rest/api/3/issue', method: 'POST', data: payload });
  }

  updateIssue(issueKey: string, data: any) {
    return this.request<void>({ url: `/rest/api/3/issue/${issueKey}`, method: 'PUT', data });
  }

  addComment(issueKey: string, body: any) {
    return this.request<any>({ url: `/rest/api/3/issue/${issueKey}/comment`, method: 'POST', data: body });
  }

  addAttachment(issueKey: string, formData: FormData) {
    return this.request<any>({
      url: `/rest/api/3/issue/${issueKey}/attachments`,
      method: 'POST',
      data: formData,
      headers: { 'X-Atlassian-Token': 'no-check' }
    });
  }

  transitionIssue(issueKey: string, transitionId: string, fields?: Record<string, any>) {
    return this.request<void>({
      url: `/rest/api/3/issue/${issueKey}/transitions`,
      method: 'POST',
      data: { transition: { id: transitionId }, fields }
    });
  }

  getTransitions(issueKey: string) {
    return this.request<{ transitions: { id: string; name: string }[] }>({
      url: `/rest/api/3/issue/${issueKey}/transitions`,
      method: 'GET'
    });
  }
}
