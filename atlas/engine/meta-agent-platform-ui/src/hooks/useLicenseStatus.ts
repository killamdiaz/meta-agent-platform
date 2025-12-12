import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export function useLicenseStatus() {
  const { user } = useAuth();
  const orgId = useMemo(
    () => (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? "",
    [user]
  );
  const licenseKey = typeof window !== "undefined" ? localStorage.getItem("forge_license_key") ?? undefined : undefined;

  const statusQuery = useQuery({
    queryKey: ["license-status", orgId, licenseKey],
    queryFn: async () => {
      if (!orgId) return null;
      return api.fetchLicenseStatus(orgId, licenseKey);
    },
    refetchInterval: 60_000, // poll every minute to update usage
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const usageQuery = useQuery({
    queryKey: ["usage-summary", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      return api.fetchUsageSummary(orgId);
    },
    refetchInterval: 60_000,
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const tokensUsed =
    Number(usageQuery.data?.total_tokens ?? 0) ||
    Number(statusQuery.data?.tokens_used ?? 0) ||
    0;
  const maxTokens = Number(statusQuery.data?.max_tokens ?? 0);
  const usageRatio = maxTokens > 0 ? Math.min(1, tokensUsed / maxTokens) : 0;

  return {
    ...statusQuery,
    usageRatio,
    isExpired:
      !!statusQuery.data &&
      (!statusQuery.data.valid ||
        (tokensUsed >= maxTokens && maxTokens > 0)),
    isWarning:
      !!statusQuery.data &&
      maxTokens > 0 &&
      usageRatio >= 0.9 &&
      usageRatio < 1,
  };
}
