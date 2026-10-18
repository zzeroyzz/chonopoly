import { SettingsShell } from "@/components/settings/SettingsShell";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";

export default function SettingsIntegrationsPage() {
  return (
    <SettingsShell
      title="Integrations"
      description="Outside data the app pulls in, and what's left of this month's allowance. Screening one property spends one RentCast request."
    >
      <IntegrationsPanel />
    </SettingsShell>
  );
}
