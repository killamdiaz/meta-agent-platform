import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useJiraStatus(orgId?: string | null) {
  return useQuery({
    queryKey: ["jira-status", orgId],
    queryFn: () => api.fetchJiraIntegrationStatus(orgId ?? undefined),
    staleTime: 30_000,
  });
}
