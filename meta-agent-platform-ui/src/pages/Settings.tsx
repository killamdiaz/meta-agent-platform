import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import { supabase } from "@/lib/supabaseClient";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrandStore } from "@/store/brandStore";

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"general" | "branding" | "license">("general");
  const [prefNotifications, setPrefNotifications] = useState(true);
  const [prefDigest, setPrefDigest] = useState(false);
  const brandDefaults = useMemo(() => useBrandStore.getState(), []);
  const setBranding = useBrandStore((state) => state.setBranding);
  const [companyName, setCompanyName] = useState(brandDefaults.companyName || "Atlas");
  const [companyShortName, setCompanyShortName] = useState(
    brandDefaults.shortName || brandDefaults.companyName || "Atlas",
  );
  const companyNameInputRef = useRef<HTMLInputElement | null>(null);
  const [loginAccent, setLoginAccent] = useState("#00A8FF");
  const [backgroundStyle, setBackgroundStyle] = useState<"solid" | "gradient" | "image">("solid");
  const [logo, setLogo] = useState<File | null>(null);
  const [sidebarLogo, setSidebarLogo] = useState<File | null>(null);
  const [favicon, setFavicon] = useState<File | null>(null);
  const [loginLogo, setLoginLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(brandDefaults.logoUrl || "/icon.png");
  const [sidebarLogoPreview, setSidebarLogoPreview] = useState<string>(
    brandDefaults.sidebarLogoUrl || brandDefaults.logoUrl || "/icon.png",
  );
  const [faviconPreview, setFaviconPreview] = useState<string>(brandDefaults.faviconUrl || "/favicon.ico");
  const [loginLogoPreview, setLoginLogoPreview] = useState<string>(
    brandDefaults.loginLogoUrl || brandDefaults.logoUrl || "/icon.png",
  );
  const [showSidebarText, setShowSidebarText] = useState<boolean>(
    brandDefaults.showSidebarText ?? true,
  );
  const brandPrefix = (companyName || brandDefaults.companyName || "Atlas").trim();
  const engineName = `${brandPrefix} Engine`;
  useEffect(() => {
    api
      .fetchBranding()
      .then((data) => {
        setCompanyName(data.companyName);
        setCompanyShortName(data.shortName || data.companyName);
        setLogoPreview(data.logoData || brandDefaults.logoUrl || "/icon.png");
        setSidebarLogoPreview(data.sidebarLogoData || data.logoData || brandDefaults.sidebarLogoUrl || "/icon.png");
        setFaviconPreview(data.faviconData || brandDefaults.faviconUrl || "/favicon.ico");
        setLoginLogoPreview(data.loginLogoData || data.logoData || brandDefaults.loginLogoUrl || "/icon.png");
        setShowSidebarText(data.showSidebarText ?? true);
        setBranding({
          companyName: data.companyName,
          shortName: data.shortName,
          logoUrl: data.logoData || brandDefaults.logoUrl || "/icon.png",
          sidebarLogoUrl: data.sidebarLogoData || data.logoData || brandDefaults.sidebarLogoUrl || "/icon.png",
          faviconUrl: data.faviconData || brandDefaults.faviconUrl || "/favicon.ico",
          loginLogoUrl: data.loginLogoData || data.logoData || brandDefaults.loginLogoUrl || "/icon.png",
          showSidebarText: data.showSidebarText ?? true,
        });
      })
      .catch((err) => console.warn("[branding] load failed", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computePreferredNames = useCallback(() => {
    const metadata = (user as SupabaseUser | null)?.user_metadata ?? {};
    const resolvedFirst =
      (user as { first_name?: string } | null)?.first_name ??
      (metadata as { first_name?: string })?.first_name ??
      (metadata as { given_name?: string })?.given_name ??
      "";
    const resolvedLast =
      (user as { last_name?: string } | null)?.last_name ??
      (metadata as { last_name?: string })?.last_name ??
      (metadata as { family_name?: string })?.family_name ??
      "";
    return { resolvedFirst: resolvedFirst ?? "", resolvedLast: resolvedLast ?? "" };
  }, [user]);

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

  useEffect(() => {
    const { resolvedFirst, resolvedLast } = computePreferredNames();
    setFirstName(resolvedFirst);
    setLastName(resolvedLast);
  }, [computePreferredNames]);

  const handleProfileSave = async () => {
    if (!user) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const nextFirst = firstName.trim();
      const nextLast = lastName.trim();
      const fullName = `${nextFirst} ${nextLast}`.trim();
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: nextFirst || undefined,
          last_name: nextLast || undefined,
          full_name: fullName || undefined,
        },
      });
      if (error) {
        throw error;
      }
      toast.success("Profile updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update profile";
      setProfileError(message);
      toast.error(message);
    } finally {
      setProfileSaving(false);
    }
  };

  const fileToDataUrl = (file: File | null): Promise<string | null> =>
    new Promise((resolve) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const handleSaveBranding = async () => {
    const normalizedCompany = companyName.trim() || "Atlas";
    const normalizedShort = companyShortName.trim() || normalizedCompany;
    const [logoData, sidebarLogoData, faviconData, loginLogoData] = await Promise.all([
      fileToDataUrl(logo),
      fileToDataUrl(sidebarLogo),
      fileToDataUrl(favicon),
      fileToDataUrl(loginLogo),
    ]);

    const effectiveLogo = logoData || logoPreview || brandDefaults.logoUrl || "/icon.png";
    const effectiveSidebar = sidebarLogoData || sidebarLogoPreview || effectiveLogo;
    const effectiveFavicon = faviconData || faviconPreview || brandDefaults.faviconUrl || "/favicon.ico";
    const effectiveLoginLogo = loginLogoData || loginLogoPreview || effectiveLogo;

    try {
      const saved = await api.saveBranding({
        companyName: normalizedCompany,
        shortName: normalizedShort,
        logoData: effectiveLogo,
        sidebarLogoData: effectiveSidebar,
        faviconData: effectiveFavicon,
        loginLogoData: effectiveLoginLogo,
        showSidebarText,
      });

      setBranding({
        companyName: saved.companyName,
        shortName: saved.shortName,
        logoUrl: saved.logoData || effectiveLogo,
        sidebarLogoUrl: saved.sidebarLogoData || effectiveSidebar,
        faviconUrl: saved.faviconData || effectiveFavicon,
        loginLogoUrl: saved.loginLogoData || effectiveLoginLogo,
        showSidebarText: saved.showSidebarText ?? showSidebarText,
      });
      toast.success("Branding saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save branding";
      toast.error(message);
    }
  };

  const handlePasswordReset = async () => {
    const email = (user as { email?: string } | null)?.email;
    if (!email) {
      toast.error("No email on file for password reset.");
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset email sent.");
  };

  const formatFileLabel = (file: File | null) => {
    if (!file) return "No file selected";
    return `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
  };

  const updateAsset = (
    file: File | null,
    setFileState: (file: File | null) => void,
    setPreviewState: Dispatch<SetStateAction<string>>,
    fallback: string,
  ) => {
    setFileState(file);
    const nextUrl = file ? URL.createObjectURL(file) : fallback;
    setPreviewState((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  };

  const handleLogoUpload = (file: File | null) =>
    updateAsset(file, setLogo, setLogoPreview, brandDefaults.logoUrl || "/icon.png");

  const handleSidebarLogoUpload = (file: File | null) =>
    updateAsset(
      file,
      setSidebarLogo,
      setSidebarLogoPreview,
      logoPreview || brandDefaults.sidebarLogoUrl || brandDefaults.logoUrl || "/icon.png",
    );

  const handleFaviconUpload = (file: File | null) =>
    updateAsset(file, setFavicon, setFaviconPreview, brandDefaults.faviconUrl || "/favicon.ico");

  const handleLoginLogoUpload = (file: File | null) =>
    updateAsset(
      file,
      setLoginLogo,
      setLoginLogoPreview,
      logoPreview || brandDefaults.loginLogoUrl || brandDefaults.logoUrl || "/icon.png",
    );

  useEffect(
    () => () => {
      [logoPreview, sidebarLogoPreview, faviconPreview, loginLogoPreview].forEach((url) => {
        if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    },
    [logoPreview, sidebarLogoPreview, faviconPreview, loginLogoPreview],
  );

  const userEmail = useMemo(
    () => (user as { email?: string } | null)?.email ?? "Not set",
    [user],
  );

  const sectionCardClass = "bg-card border border-border rounded-2xl shadow-sm";

  const SettingsTabs = () => {
    const tabs: Array<{ id: typeof selectedTab; label: string }> = [
      { id: "general", label: "General" },
      { id: "branding", label: "Branding" },
      { id: "license", label: "License" },
    ];
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-white/5 p-1 border border-white/10 shadow-inner">
        {tabs.map((tab) => {
          const active = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ease-out",
                active
                  ? "bg-[#0b1a26]/90 text-white shadow-[0_10px_30px_rgba(0,168,255,0.25)] border border-[#00A8FF]/50"
                  : "text-white/70 hover:text-white hover:bg-white/5",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  };

  const SettingsSection = ({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children: React.ReactNode;
  }) => (
    <Card className={sectionCardClass}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg text-white">
          <span>{title}</span>
          <span className="text-xs text-white/50 uppercase tracking-[0.08em]">{brandPrefix}</span>
        </CardTitle>
        {description ? <p className="text-sm text-white/60">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );

  const FormField = ({
    label,
    helper,
    children,
  }: {
    label: string;
    helper?: string;
    children: React.ReactNode;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-white/80">{label}</label>
        {helper ? <span className="text-xs text-white/50">{helper}</span> : null}
      </div>
      {children}
    </div>
  );

  const UploadLogo = ({
    label,
    helper,
    file,
    onChange,
  }: {
    label: string;
    helper?: string;
    file: File | null;
    onChange: (file: File | null) => void;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/80">{label}</span>
        {helper ? <span className="text-xs text-white/50">{helper}</span> : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-20 rounded-xl border border-dashed border-white/15 bg-white/5 flex items-center justify-center text-xs text-white/60">
          {formatFileLabel(file)}
        </div>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/10 text-sm text-white cursor-pointer hover:border-white/30 transition">
          Upload
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    </div>
  );

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
    <div className="min-h-screen bg-[#0a0a0a] p-8 space-y-6 text-white animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Settings</h1>
          <p className="text-sm text-white/70">Manage your profile, company branding, and license settings.</p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="h-10 px-4 rounded-full bg-white/5 border border-white/10 flex items-center text-xs text-white/70">
            {engineName} · Secure Workspace
          </div>
        </div>
      </div>

      <SettingsTabs />

      <div className="space-y-4">
        {selectedTab === "general" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SettingsSection
              title="Profile"
              description="Control your identity and personal details."
            >
              <FormField label="First name">
                <Input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </FormField>
              <FormField label="Last name">
                <Input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </FormField>
              <div className="flex gap-2">
                <Button onClick={handleProfileSave} disabled={profileSaving}>
                  {profileSaving ? "Saving…" : "Save profile"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const { resolvedFirst, resolvedLast } = computePreferredNames();
                    setFirstName(resolvedFirst);
                    setLastName(resolvedLast);
                  }}
                >
                  Reset
                </Button>
              </div>
              {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}
            </SettingsSection>

            <SettingsSection
              title="Account & Security"
              description="Account email, password, and notification preferences."
            >
              <FormField label="Email">
                <Input value={userEmail} readOnly className="bg-white/5 border-white/10 text-white" />
              </FormField>
              <FormField label="Password">
                <div className="flex items-center gap-2">
                  <Input value="••••••••" readOnly className="bg-white/5 border-white/10 text-white/60" />
                  <Button variant="outline" onClick={handlePasswordReset}>
                    Send reset
                  </Button>
                </div>
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Notifications">
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <span className="text-sm text-white/80">Real-time alerts</span>
                    <Switch checked={prefNotifications} onCheckedChange={(checked) => setPrefNotifications(checked)} />
                  </div>
                </FormField>
                <FormField label="Digest">
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <span className="text-sm text-white/80">Daily summary</span>
                    <Switch checked={prefDigest} onCheckedChange={(checked) => setPrefDigest(checked)} />
                  </div>
                </FormField>
              </div>
            </SettingsSection>
          </div>
        )}

        {selectedTab === "branding" && (
          <div className="space-y-4">
            <SettingsSection
              title="Company Identity"
              description={`Set how your organization shows up across ${engineName}.`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Company Name">
                  <Input
                    ref={companyNameInputRef}
                    value={companyName}
                    onChange={(event) => {
                      const value = event.target.value;
                      const caret = companyNameInputRef.current?.selectionStart ?? value.length;
                      setCompanyName(value);
                      requestAnimationFrame(() => {
                        const el = companyNameInputRef.current;
                        if (!el) return;
                        el.focus();
                        try {
                          const nextPos = Math.min(value.length, caret + (value.length - companyName.length));
                          el.setSelectionRange(nextPos, nextPos);
                        } catch {
                          /* ignore */
                        }
                      });
                    }}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="Atlas"
                  />
                </FormField>
                <FormField label="Short Name" helper="Used in emails and alerts">
                  <Input
                    value={companyShortName}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCompanyShortName(value);
                    }}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="Atlas"
                  />
                </FormField>
              </div>
            </SettingsSection>

            <SettingsSection
              title="Logo & Icon"
              description="Upload brand assets for app chrome and navigation."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UploadLogo
                  label="Upload Logo"
                  helper="SVG preferred"
                  file={logo}
                  onChange={handleLogoUpload}
                />
                <UploadLogo
                  label="Upload Sidebar Logo"
                  helper="Displayed in navigation"
                  file={sidebarLogo}
                  onChange={handleSidebarLogoUpload}
                />
                <UploadLogo
                  label="Upload Favicon"
                  helper="ICO or PNG"
                  file={favicon}
                  onChange={handleFaviconUpload}
                />
                <div className="space-y-2">
                  <span className="text-sm text-white/80">Preview</span>
                  <div className="h-20 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center text-xs text-white/60">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt={`${brandPrefix} logo preview`}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      formatFileLabel(logo)
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <input
                    id="toggle-sidebar-text"
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-transparent accent-[#00A8FF]"
                    checked={showSidebarText}
                    onChange={(e) => setShowSidebarText(e.target.checked)}
                  />
                  <label htmlFor="toggle-sidebar-text" className="text-sm text-white/80">
                    Show sidebar brand text
                  </label>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              title="Login Page Branding"
              description="Tune the first impression for users signing in."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UploadLogo
                  label="Login Page Logo"
                  file={loginLogo}
                  onChange={handleLoginLogoUpload}
                />
                <FormField label="Login Accent Color">
                  <div className="flex items-center gap-3">
                    <Input
                      type="color"
                      value={loginAccent}
                      onChange={(event) => setLoginAccent(event.target.value)}
                      className="h-10 w-16 p-1 bg-white/5 border-white/10"
                    />
                    <Input
                      value={loginAccent}
                      onChange={(event) => setLoginAccent(event.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                </FormField>
                <FormField label="Background Style">
                  <Select
                    value={backgroundStyle}
                    onValueChange={(value) => setBackgroundStyle(value as "solid" | "gradient" | "image")}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f131c] border-white/10 text-white">
                      <SelectItem value="solid">Solid</SelectItem>
                      <SelectItem value="gradient">Gradient</SelectItem>
                      <SelectItem value="image">Image Upload</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </SettingsSection>
            <div className="flex justify-end">
              <Button onClick={handleSaveBranding}>Save branding</Button>
            </div>
          </div>
        )}

        {selectedTab === "license" && (
          <SettingsSection
            title="License & Entitlements"
            description="Enterprise license controls and usage visibility."
          >
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={statusVariant} className="text-xs">
                {statusLabel}
              </Badge>
              <span className="text-xs text-white/60">
                {license?.expires_at ? `Expires ${new Date(license.expires_at).toLocaleString()}` : "No expiry loaded"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-white/70">License key</label>
                <Input value={license?.license_key ?? ""} readOnly placeholder="Not set" className="bg-white/5 border-white/10 text-white" />
                <p className="text-xs text-white/50">License keys are read-only once applied.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/70">Customer</label>
                <Input value={license?.customer_name ?? ""} readOnly placeholder="Unknown" className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-white/70">Expiry</p>
                <p className="text-lg font-semibold">
                  {license?.expires_at ? new Date(license.expires_at).toLocaleString() : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-white/70">Seats remaining</p>
                <p className="text-lg font-semibold">
                  {license ? `${seatsRemaining} / ${seatsTotal || 0}` : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-white/70">Tokens</p>
                <p className="text-lg font-semibold">
                  {license ? `${tokensUsed.toLocaleString()} / ${tokensTotal.toLocaleString()}` : "—"}
                </p>
                <p className="text-xs text-white/60">
                  Remaining: {tokensRemaining.toLocaleString()} ({Math.round(tokensUsage * 100)}% used)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Dialog open={showApply} onOpenChange={setShowApply}>
                <DialogTrigger asChild>
                  <Button variant="secondary">Apply New License</Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0f131c] border-white/10 text-white">
                  <DialogHeader>
                    <DialogTitle>Apply license</DialogTitle>
                    <DialogDescription className="text-white/70">
                      Paste the new license key to replace the current one.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <label className="text-sm text-white/70">New license key</label>
                    <Input
                      value={newLicenseKey}
                      onChange={(e) => setNewLicenseKey(e.target.value)}
                      placeholder="customerId:expires:signature"
                      className="bg-white/5 border-white/10 text-white"
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
              <div className="text-sm text-destructive mt-2">Reason: {license.reason}</div>
            )}
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
