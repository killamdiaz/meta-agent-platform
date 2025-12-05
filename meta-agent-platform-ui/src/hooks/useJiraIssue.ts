import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

export type JiraIssueDetails = {
  key: string;
  summary: string;
  descriptionHtml?: string;
  priority?: string;
  reporter?: string;
  assignee?: string;
  status?: string;
  created?: string;
  updated?: string;
  comments?: Array<{ author?: string; body?: string; created?: string }>;
  attachments?: Array<{ filename?: string; url?: string; size?: number }>;
  changelog?: unknown;
  transitions?: unknown;
};

export async function getIssueDetails(issueKey: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${API_BASE}/connectors/jira/api/issues/${encodeURIComponent(issueKey)}`, {
    headers: { "Content-Type": "application/json", ...headers },
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const data = await res.json();
  return data.issue as JiraIssueDetails;
}

export function useJiraIssue(issueKey?: string | null, headers: Record<string, string> = {}) {
  const [issue, setIssue] = useState<JiraIssueDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!issueKey) {
      setIssue(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getIssueDetails(issueKey, headers)
      .then((data) => {
        if (!cancelled) setIssue(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load issue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [issueKey, headers]);

  return { issue, loading, error };
}
