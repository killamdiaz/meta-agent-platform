import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useSupabaseTokenSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const accessToken = url.searchParams.get("token");
    const refreshToken = url.searchParams.get("refresh");

    if (!accessToken || !refreshToken) {
      return;
    }

    void supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error("[supabase] Failed to restore session from redirect", error);
          return;
        }

        const params = url.searchParams;
        params.delete("token");
        params.delete("refresh");
        const cleanedSearch = params.toString();
        const newUrl = `${url.pathname}${cleanedSearch ? `?${cleanedSearch}` : ""}${url.hash}`;
        window.history.replaceState({}, "", newUrl);
        console.log("✅ Supabase session restored from Atlas redirect");
      });
  }, []);
}
