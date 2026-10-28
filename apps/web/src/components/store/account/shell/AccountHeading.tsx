import { T_ACCOUNT_TITLE } from "@/components/ui/typography";

/** Title block of a «Mi cuenta» section, inside the card (so ink text, not the wallpaper's). */
const AccountHeading = ({ title, lead }: { title: string; lead?: string }) => (
  <header className="mb-6">
    <h1 className={T_ACCOUNT_TITLE}>{title}</h1>
    {lead ? <p className="mt-1.5 text-text-secondary">{lead}</p> : null}
  </header>
);

export { AccountHeading };
