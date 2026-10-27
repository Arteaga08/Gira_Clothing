/**
 * The brand's social networks, fixed in code (decision of 2026-10-26: no panel
 * for them). A network with an empty href is not drawn, so the footer never
 * links to nowhere. Fill each href with the full https URL to show it.
 */

type SocialNetworkKey = "instagram" | "tiktok" | "facebook" | "whatsapp";

interface SocialNetwork {
  key: SocialNetworkKey;
  label: string;
  href: string;
}

const STORE_SOCIAL: SocialNetwork[] = [
  { key: "instagram", label: "Instagram", href: "" },
  { key: "tiktok", label: "TikTok", href: "" },
  { key: "facebook", label: "Facebook", href: "" },
  { key: "whatsapp", label: "WhatsApp", href: "" },
];

const activeSocialNetworks = (networks: SocialNetwork[] = STORE_SOCIAL): SocialNetwork[] =>
  networks.filter((network) => network.href !== "");

export type { SocialNetwork, SocialNetworkKey };
export { STORE_SOCIAL, activeSocialNetworks };
