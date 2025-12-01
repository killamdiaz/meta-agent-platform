import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { refreshJiraToken, getJiraToken } from './storage.js';

export interface JiraClientOptions {
  orgId: string;
  cloudId: string;
  accessToken: string;
}

const BASE_URL = 'https://api.atlassian.com/ex/jira';

export class JiraClient {
  private client: AxiosInstance;
  private orgId: string;
  private cloudId: string;

  constructor(options: JiraClientOptions) {
    this.orgId = options.orgId;
    this.cloudId = options.cloudId;
    this.client = axios.create({
      baseURL: `${BASE_URL}/${options.cloudId}`,
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        Accept: 'application/json'
      }
    });
  }

  static async fromOrg(orgId: string) {
    const token = await getJiraToken(orgId);
    if (!token || !token.cloud_id) throw new Error('Jira not connected for this org');
    const now = Date.now();
    const shouldRefresh = !token.expires_at || token.expires_at.getTime() - now < 5 * 60 * 1000;
    let activeToken = token;
    if (shouldRefresh) {
      const refreshed = await refreshJiraToken(orgId);
      if (refreshed) activeToken = refreshed;
    }
    return new JiraClient({
      orgId,
      cloudId: activeToken.cloud_id!,
      accessToken: activeToken.access_token
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
    const jql = accountId ? `assignee=${accountId} AND resolution=Unresolved` : 'assignee=currentUser() AND resolution=Unresolved';
    return this.searchIssues({ jql });
  }

  searchIssues(params: { jql?: string; query?: string; status?: string; assignee?: string }) {
    const clauses: string[] = [];
    if (params.jql) clauses.push(params.jql);
    if (params.query) clauses.push(`text ~ "${params.query}"`);
    if (params.status) clauses.push(`status = "${params.status}"`);
    if (params.assignee) clauses.push(`assignee = "${params.assignee}"`);
    const jql = clauses.length ? clauses.join(' AND ') : 'ORDER BY updated DESC';
    return this.request<{ issues: any[] }>({
      url: '/rest/api/3/search',
      method: 'POST',
      data: { jql, expand: ['changelog', 'renderedFields'] }
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
}
