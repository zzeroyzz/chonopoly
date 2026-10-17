import { DefaultsForm } from "@/components/settings/DefaultsForm";

export default function SettingsDefaultsPage() {
  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary) px-5 py-6 pb-24">
      <h1 className="text-[18px] font-semibold mb-1">Loan &amp; cost defaults</h1>
      <p className="text-[12px] text-(--color-text-secondary) mb-5 leading-relaxed">
        Where every screening starts. A scenario can still override any of these —
        this is what saves you retyping the same rate for every house.
      </p>
      <DefaultsForm />
      <p className="text-[12px] mt-5">
        <a href="/settings/profile" className="text-(--color-accent)">Income &amp; debts →</a>
      </p>
    </div>
  );
}
