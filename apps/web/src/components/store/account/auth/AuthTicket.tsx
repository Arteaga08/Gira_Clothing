import type { ReactNode } from "react";
import { T_ACCESS_TITLE } from "@/components/ui/typography";
import type { AuthPhoto } from "@/lib/store/authPhoto";

type StubTone = "pink" | "lilac" | "mint";

interface AuthTicketProps {
  title: string;
  lead?: string;
  /** The sticker on the stub: «Admite una», «Pase de miembro»… */
  stubLabel: string;
  tone: StubTone;
  photo: AuthPhoto | null;
  /** Content of the stub that is real information (the resend countdown), not decoration. */
  stubExtra?: ReactNode;
  children: ReactNode;
}

/**
 * The shell of every access page: a ticket with the form on the left and a stub on the
 * right (the first hero photo, a sticker, a barcode). The stub is decoration — the photo has
 * an empty alt and the sticker and barcode are hidden from assistive tech — except `stubExtra`.
 */
const AuthTicket = ({ title, lead, stubLabel, tone, photo, stubExtra, children }: AuthTicketProps) => (
  <section className="store-ticket">
    <div className="store-ticket-main">
      <h1 className={T_ACCESS_TITLE}>{title}</h1>
      {lead ? <p className="mt-2 max-w-[44ch] text-text-secondary">{lead}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
    <aside className="store-ticket-stub" data-tone={tone}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
        <img src={photo.url} alt="" width={photo.width} height={photo.height} decoding="async" className="store-ticket-photo" />
      ) : stubExtra ? null : (
        // With real information on the stub (the countdown) the flat colour is enough: the arch would peek out behind it.
        <div aria-hidden="true" className="store-ticket-art absolute inset-0" />
      )}
      <span aria-hidden="true" className="store-ticket-sticker">
        {stubLabel}
      </span>
      <div aria-hidden="true" className="store-barcode" />
      {stubExtra}
    </aside>
  </section>
);

export type { AuthTicketProps, StubTone };
export { AuthTicket };
