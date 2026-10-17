import { SettingsShell } from "@/components/settings/SettingsShell";
import { DefaultsForm } from "@/components/settings/DefaultsForm";

export default function SettingsDefaultsPage() {
  return (
    <SettingsShell
      title="Loan & cost defaults"
      description="Where every screening starts. A scenario can still override any of these — this is what saves you retyping the same rate for every house."
    >
      <DefaultsForm />
    </SettingsShell>
  );
}
