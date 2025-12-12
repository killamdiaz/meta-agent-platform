import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useJiraStatus(orgId?: string | null, accountId?: string | null) {
  return useQuery({
    queryKey: ["jira-status", orgId, accountId],
    queryFn: () => api.fetchJiraIntegrationStatus(orgId ?? undefined, accountId ?? undefined),
    staleTime: 30_000,
  });
}
