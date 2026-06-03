import { Badge, Card, CardContent, CardHeader, CardTitle } from "@probis/ui";
import { PageShell } from "@/components/layout/page-shell";

const settings = [
  ["Supabase", "configured by env"],
  ["Redis", "prepared"],
  ["Workers", "future integration"],
  ["Authentication", "auth-ready"]
] as const;

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="Operational configuration, integrations, and platform readiness."
    >
      <Card>
        <CardHeader>
          <CardTitle>Environment Readiness</CardTitle>
        </CardHeader>
        <CardContent className="divide-border divide-y">
          {settings.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0"
            >
              <span className="text-muted-foreground">{label}</span>
              <Badge variant="outline">{value}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageShell>
  );
}
