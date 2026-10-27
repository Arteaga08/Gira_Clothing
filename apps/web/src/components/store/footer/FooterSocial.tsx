import type { Icon } from "@phosphor-icons/react";
import { FacebookLogo, InstagramLogo, TiktokLogo, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { SocialNetwork, SocialNetworkKey } from "@/lib/store/socialLinks";

interface FooterSocialProps {
  networks: SocialNetwork[];
}

const ICONS: Record<SocialNetworkKey, Icon> = {
  instagram: InstagramLogo,
  tiktok: TiktokLogo,
  facebook: FacebookLogo,
  whatsapp: WhatsappLogo,
};

/** Networks as round bone stickers with an ink edge, 44px targets. Nothing to show, nothing drawn. */
const FooterSocial = ({ networks }: FooterSocialProps) => {
  if (networks.length === 0) return null;
  return (
    <ul className="flex items-center gap-3">
      {networks.map((network) => {
        const NetworkIcon = ICONS[network.key];
        return (
          <li key={network.key}>
            <a
              href={network.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${network.label} (se abre en otra pestaña)`}
              className="footer-social grid size-11 place-items-center rounded-full border-2 border-ink bg-surface text-ink shadow-nb"
            >
              <NetworkIcon aria-hidden="true" weight="bold" className="size-5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
};

export type { FooterSocialProps };
export { FooterSocial };
