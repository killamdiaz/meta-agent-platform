import { Card } from "@/components/ui/card";

export default function Help() {
  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Help</h1>
        <p className="text-muted-foreground">Get started with Atlas Forge</p>
      </div>

      <Card className="bg-card border-border p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Help documentation coming soon</p>
        </div>
      </Card>
    </div>
  );
}
