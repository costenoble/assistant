import { cookies } from "next/headers";
import { requireClient } from "@/lib/auth/require-client";
import { avatarUrl } from "@/lib/profile/avatar-url";
import { THEME_COOKIE, parseTheme } from "@/lib/theme/theme";
import { Breadcrumb } from "@/components/projects/breadcrumb";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { ThemeSwitch } from "@/components/theme-switch";
import { ProfileForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon profil · Espace membre" };

export default async function ProfilePage() {
  const { contact, clients } = await requireClient();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value ?? "light");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb items={[{ label: "Accueil", href: "/portail" }, { label: "Mon profil" }]} />
      <h1 className="rise-in page-title text-[32px] leading-[38px]">Mon profil</h1>

      <section className="rise-in card space-y-5 p-6" style={{ "--i": 1 } as React.CSSProperties}>
        <h2 className="section-title">Photo</h2>
        <AvatarUploader name={contact.full_name} current={avatarUrl(contact.id, contact.avatar_key)} />
      </section>

      <section className="rise-in card space-y-5 p-6" style={{ "--i": 2 } as React.CSSProperties}>
        <h2 className="section-title">Informations</h2>
        <ProfileForm name={contact.full_name} jobTitle={contact.job_title} phone={contact.phone} email={contact.email ?? ""} notifyEmail={contact.notify_email} />
      </section>

      <section className="rise-in card space-y-3 p-6" style={{ "--i": 3 } as React.CSSProperties}>
        <h2 className="section-title">Apparence</h2>
        <p className="text-sm text-muted">Clair, sombre, ou automatique selon votre appareil.</p>
        <div className="max-w-sm"><ThemeSwitch theme={theme} /></div>
      </section>

      <section className="rise-in card space-y-2 p-6" style={{ "--i": 4 } as React.CSSProperties}>
        <h2 className="section-title">Vos espaces</h2>
        <ul className="flex flex-wrap gap-2">{clients.map((c) => <li key={c.id} className="chip text-xs">{c.name}</li>)}</ul>
      </section>
    </div>
  );
}
