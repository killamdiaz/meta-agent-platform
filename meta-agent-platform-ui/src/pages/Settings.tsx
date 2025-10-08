import { Card } from "@/components/ui/card";

export default function Settings() {
  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure your Atlas Forge workspace</p>
      </div>

      <Card className="bg-card border-border p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Settings panel coming soon</p>
        </div>
      </Card>
    </div>
  );
}
