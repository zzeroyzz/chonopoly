import { SettingsShell } from "@/components/settings/SettingsShell";
import { ProfileForm } from "@/components/settings/ProfileForm";

export default function SettingsProfilePage() {
  return (
    <SettingsShell
      title="Income & debts"
      description="Entered once and used for every house you screen. Nothing re-runs on its own — saved analyses tell you when these numbers have moved."
    >
      <ProfileForm />
    </SettingsShell>
  );
}
