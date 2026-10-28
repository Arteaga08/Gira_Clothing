"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountProfile, Wire } from "@gira/shared";
import { Notice } from "@/components/ui/Notice";
import { PasswordCard } from "./PasswordCard";
import { PersonalDataCard } from "./PersonalDataCard";
import { SessionsCard } from "./SessionsCard";

type Editing = "profile" | "password" | null;
type Block = Exclude<Editing, null>;

const HEADING_ID: Record<Block, string> = { profile: "personal-title", password: "password-title" };

const DIVIDER = "border-t-2 border-dashed border-ink pt-6";

/**
 * Body of `/cuenta/perfil`. Only one block can be in edit mode at a time, so a half-typed form is never silently dropped.
 * When a form closes, focus goes to that block's heading: the button that opened it was replaced by the form.
 */
const ProfileSection = ({ initialProfile }: { initialProfile: Wire<AccountProfile> }) => {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusBlock, setFocusBlock] = useState<{ block: Block } | null>(null);

  useEffect(() => {
    if (focusBlock) document.getElementById(HEADING_ID[focusBlock.block])?.focus();
  }, [focusBlock]);

  const close = (block: Block) => {
    setEditing(null);
    setFocusBlock({ block });
  };

  const start = (target: Exclude<Editing, null>) => {
    setNotice(null);
    setEditing(target);
  };

  const profileSaved = (saved: Wire<AccountProfile>) => {
    setProfile(saved);
    close("profile");
    setNotice("Guardamos tus cambios.");
    // The sidebar greets by name: re-run the server render so it picks the new one up.
    router.refresh();
  };

  const passwordDone = () => {
    close("password");
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
        onCancel={() => close("profile")}
      />
      <div className={DIVIDER}>
        <PasswordCard editing={editing === "password"} onEdit={() => start("password")} onDone={passwordDone} onCancel={() => close("password")} />
      </div>
      <div className={DIVIDER}>
        <SessionsCard />
      </div>
    </div>
  );
};

export { ProfileSection };
