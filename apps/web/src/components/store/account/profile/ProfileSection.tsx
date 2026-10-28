"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountProfile, Wire } from "@gira/shared";
import { Notice } from "@/components/ui/Notice";
import { PasswordCard } from "./PasswordCard";
import { PersonalDataCard } from "./PersonalDataCard";
import { SessionsCard } from "./SessionsCard";

type Editing = "profile" | "password" | null;

const DIVIDER = "border-t-2 border-dashed border-ink pt-6";

/** Body of `/cuenta/perfil`. Only one block can be in edit mode at a time, so a half-typed form is never silently dropped. */
const ProfileSection = ({ initialProfile }: { initialProfile: Wire<AccountProfile> }) => {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = (target: Exclude<Editing, null>) => {
    setNotice(null);
    setEditing(target);
  };

  const profileSaved = (saved: Wire<AccountProfile>) => {
    setProfile(saved);
    setEditing(null);
    setNotice("Guardamos tus cambios.");
    // The sidebar greets by name: re-run the server render so it picks the new one up.
    router.refresh();
  };

  const passwordDone = () => {
    setEditing(null);
    setNotice("Cambiamos tu contraseña y cerramos tus otras sesiones.");
  };

  return (
    <div className="grid gap-6">
      {notice ? (
        <Notice variant="info" title="Listo">
          {notice}
        </Notice>
      ) : null}
      <PersonalDataCard
        profile={profile}
        editing={editing === "profile"}
        onEdit={() => start("profile")}
        onSaved={profileSaved}
        onCancel={() => setEditing(null)}
      />
      <div className={DIVIDER}>
        <PasswordCard editing={editing === "password"} onEdit={() => start("password")} onDone={passwordDone} onCancel={() => setEditing(null)} />
      </div>
      <div className={DIVIDER}>
        <SessionsCard />
      </div>
    </div>
  );
};

export { ProfileSection };
