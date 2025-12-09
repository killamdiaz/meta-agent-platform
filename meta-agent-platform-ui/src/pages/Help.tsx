import { Card } from "@/components/ui/card";
import { useBrandStore } from "@/store/brandStore";

export default function Help() {
  const engineName = useBrandStore(
    (state) => `${state.companyName?.trim() || "Atlas"} Engine`,
  );
  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Help</h1>
        <p className="text-muted-foreground">Get started with {engineName}</p>
      </div>

      <Card className="bg-card border-border p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Help documentation coming soon</p>
        </div>
      </Card>
    </div>
  );
}
