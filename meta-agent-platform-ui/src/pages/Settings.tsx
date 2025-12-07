import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

type LicenseState = {
  license_id: string;
  customer_name: string;
  customer_id: string;
  expires_at: string;
  max_seats: number;
  max_tokens: number;
  license_key: string;
  seats_used: number;
  tokens_used: number;
  valid: boolean;
  reason?: string;
} | null;

export default function Settings() {
  const { user } = useAuth();
  const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? "";
  const [license, setLicense] = useState<LicenseState>(null);
  const [loading, setLoading] = useState(false);
  const [newLicenseKey, setNewLicenseKey] = useState(() => localStorage.getItem("forge_license_key") ?? "");
  const [showApply, setShowApply] = useState(false);
  const [usageTokens, setUsageTokens] = useState<number | null>(null);

  const loadStatus = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const status = await api.fetchLicenseStatus(orgId, newLicenseKey || undefined);
      setLicense(status);
      if (status.license_key) {
        localStorage.setItem("forge_license_key", status.license_key);
      }
    } catch (error) {
      console.warn("[settings] license status", error);
      setLicense(null);
    } finally {
      setLoading(false);
    }
  };

  // Pull actual usage from billing summary for accurate token consumption
  useEffect(() => {
    if (!orgId) return;
    api
      .fetchUsageSummary(orgId)
      .then((summary) => {
        setUsageTokens(Number(summary?.total_tokens ?? 0));
      })
      .catch((err) => {
        console.warn("[settings] usage summary", err);
        setUsageTokens(null);
      });
  }, [orgId]);

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const applyLicense = async () => {
    if (!newLicenseKey || !orgId) return;
    setLoading(true);
    try {
      await api.applyLicense(orgId, newLicenseKey.trim());
      await loadStatus();
      toast.success("License applied");
      setShowApply(false);
      localStorage.setItem("forge_license_key", newLicenseKey.trim());
    } catch (error) {
      console.error(error);
      toast.error("Failed to apply license");
    } finally {
      setLoading(false);
    }
  };

  const validateLicense = async () => {
    const key = license?.license_key || newLicenseKey;
    if (!key) return;
    setLoading(true);
    try {
      await api.validateLicense(key);
      await loadStatus();
      toast.success("License validated");
    } catch (error) {
      console.error(error);
      toast.error("Validation failed");
    } finally {
      setLoading(false);
    }
  };

  const refreshLicense = async () => {
    const key = license?.license_key || newLicenseKey;
    if (!key) return;
    setLoading(true);
    try {
      await api.refreshLicense(key);
      await loadStatus();
      toast.success("License refreshed");
    } catch (error) {
      console.error(error);
      toast.error("Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = license?.valid ? "Active" : license ? "Invalid" : "Not set";
  const statusVariant = license?.valid ? "default" : license ? "destructive" : "secondary";
  const seatsUsed = Number(license?.seats_used ?? 0);
  const seatsTotal = Number(license?.max_seats ?? 0);
  const tokensUsedFromLicense = Number(license?.tokens_used ?? 0);
  const tokensUsed = usageTokens ?? tokensUsedFromLicense;
  const tokensTotal = Number(license?.max_tokens ?? 0);
  const seatsRemaining = seatsTotal ? Math.max(seatsTotal - seatsUsed, 0) : 0;
  const tokensRemaining = tokensTotal ? Math.max(tokensTotal - tokensUsed, 0) : 0;
  const tokensUsage = tokensTotal ? Math.min(tokensUsed / tokensTotal, 1) : 0;

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure your Atlas Forge workspace</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2">
            License &amp; Entitlements{" "}
            <Badge variant={statusVariant} className="text-xs">
              {statusLabel}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage your enterprise license. All features are gated by license validity.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">License key</label>
              <Input value={license?.license_key ?? ""} readOnly placeholder="Not set" />
              <p className="text-xs text-muted-foreground">License keys are read-only once applied.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Customer</label>
              <Input value={license?.customer_name ?? ""} readOnly placeholder="Unknown" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Expiry</p>
              <p className="text-lg font-semibold">
                {license?.expires_at ? new Date(license.expires_at).toLocaleString() : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Seats remaining</p>
              <p className="text-lg font-semibold">
                {license ? `${seatsRemaining} / ${seatsTotal || 0}` : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Tokens</p>
              <p className="text-lg font-semibold">
                {license ? `${tokensUsed.toLocaleString()} / ${tokensTotal.toLocaleString()}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Remaining: {tokensRemaining.toLocaleString()} ({Math.round(tokensUsage * 100)}% used)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Dialog open={showApply} onOpenChange={setShowApply}>
              <DialogTrigger asChild>
                <Button variant="secondary">Apply New License</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Apply license</DialogTitle>
                  <DialogDescription>Paste the new license key to replace the current one.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">New license key</label>
                  <Input
                    value={newLicenseKey}
                    onChange={(e) => setNewLicenseKey(e.target.value)}
                    placeholder="customerId:expires:signature"
                  />
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button onClick={applyLicense} disabled={loading || !newLicenseKey}>
                    Apply
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={validateLicense} disabled={loading || !license?.license_key}>
              Validate License
            </Button>
            <Button variant="secondary" onClick={refreshLicense} disabled={loading || !license?.license_key}>
              Refresh License
            </Button>
            <Button variant="ghost" onClick={loadStatus} disabled={loading}>
              Reload Status
            </Button>
          </div>

          {license?.reason && !license.valid && (
            <div className="text-sm text-destructive">Reason: {license.reason}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
