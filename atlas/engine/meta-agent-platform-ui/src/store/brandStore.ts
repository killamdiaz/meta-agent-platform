import { create } from "zustand";

type BrandingState = {
  companyName: string;
  shortName: string;
  logoUrl: string;
  sidebarLogoUrl: string;
  faviconUrl: string;
  loginLogoUrl: string;
  showSidebarText: boolean;
  setBranding: (update: Partial<Omit<BrandingState, "setBranding">>) => void;
};

const defaultLogo = "/icon.png";
const defaultFavicon = "/favicon.ico";
const defaultBrand = "Atlas";
const BRAND_CACHE_KEY = "atlas-branding-cache";

const loadCachedBranding = (): Partial<BrandingState> => {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      companyName: parsed.companyName,
      shortName: parsed.shortName,
      logoUrl: parsed.logoUrl,
      sidebarLogoUrl: parsed.sidebarLogoUrl,
      faviconUrl: parsed.faviconUrl,
      loginLogoUrl: parsed.loginLogoUrl,
      showSidebarText: parsed.showSidebarText,
    };
  } catch {
    return {};
  }
};

const writeCachedBranding = (state: BrandingState) => {
  try {
    localStorage.setItem(
      BRAND_CACHE_KEY,
      JSON.stringify({
        companyName: state.companyName,
        shortName: state.shortName,
        logoUrl: state.logoUrl,
        sidebarLogoUrl: state.sidebarLogoUrl,
        faviconUrl: state.faviconUrl,
        loginLogoUrl: state.loginLogoUrl,
        showSidebarText: state.showSidebarText,
      }),
    );
  } catch {
    // ignore cache errors
  }
};

export const useBrandStore = create<BrandingState>((set) => ({
  companyName: loadCachedBranding().companyName || defaultBrand,
  shortName: loadCachedBranding().shortName || defaultBrand,
  logoUrl: loadCachedBranding().logoUrl || defaultLogo,
  sidebarLogoUrl: loadCachedBranding().sidebarLogoUrl || loadCachedBranding().logoUrl || defaultLogo,
  faviconUrl: loadCachedBranding().faviconUrl || defaultFavicon,
  loginLogoUrl: loadCachedBranding().loginLogoUrl || loadCachedBranding().logoUrl || defaultLogo,
  showSidebarText: loadCachedBranding().showSidebarText ?? true,
  setBranding: (update) =>
    set((state) => {
      const nextCompany = update.companyName?.trim() || state.companyName || defaultBrand;
      const nextShort = update.shortName?.trim() || update.companyName?.trim() || state.shortName || defaultBrand;
      const nextLogo = update.logoUrl ?? state.logoUrl ?? defaultLogo;
      const nextSidebarLogo = update.sidebarLogoUrl ?? state.sidebarLogoUrl ?? defaultLogo;
      const nextFavicon = update.faviconUrl ?? state.faviconUrl ?? defaultFavicon;
      const nextLoginLogo = update.loginLogoUrl ?? state.loginLogoUrl ?? defaultLogo;
      const nextShowSidebarText = update.showSidebarText ?? state.showSidebarText ?? true;

      const noChange =
        state.companyName === nextCompany &&
        state.shortName === nextShort &&
        state.logoUrl === nextLogo &&
        state.sidebarLogoUrl === nextSidebarLogo &&
        state.faviconUrl === nextFavicon &&
        state.loginLogoUrl === nextLoginLogo &&
        state.showSidebarText === nextShowSidebarText;

      if (noChange) return state;

      return {
        ...state,
        ...update,
        companyName: nextCompany,
        shortName: nextShort,
        logoUrl: nextLogo,
        sidebarLogoUrl: nextSidebarLogo,
        faviconUrl: nextFavicon,
        loginLogoUrl: nextLoginLogo,
        showSidebarText: nextShowSidebarText,
      };
    }),
}));

// Keep a copy in localStorage to avoid flash of default branding
useBrandStore.subscribe((state) => {
  writeCachedBranding(state);
});

export const getBrandPrefix = () => useBrandStore.getState().companyName || defaultBrand;
