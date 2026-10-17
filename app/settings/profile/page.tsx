import { ProfileForm } from "@/components/settings/ProfileForm";

export default function SettingsProfilePage() {
  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary) px-5 py-6 pb-24">
      <h1 className="text-[18px] font-semibold mb-1">Your profile</h1>
      <p className="text-[12px] text-(--color-text-secondary) mb-5 leading-relaxed">
        Entered once and used for every house you screen. Nothing re-runs on its own
        — saved scenarios tell you when these numbers have moved.
      </p>
      <ProfileForm />
    </div>
  );
}
