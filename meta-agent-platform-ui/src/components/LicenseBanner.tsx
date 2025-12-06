type BannerKind = "expired" | "warning";

interface LicenseBannerProps {
  kind: BannerKind;
  message: string;
}

const styles: Record<BannerKind, string> = {
  expired: "bg-destructive text-destructive-foreground",
  warning: "bg-amber-500 text-amber-950",
};

export function LicenseBanner({ kind, message }: LicenseBannerProps) {
  return (
    <div className={`w-full px-4 py-2 text-sm font-medium text-center ${styles[kind]}`}>
      {message}
    </div>
  );
}
