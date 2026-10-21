/** The section whose modal is open (`?seccion=`), in the Spanish the address bar shows. */
const SETTINGS_SECTIONS = ["iva", "envio", "2fa"] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTION_PARAM = "seccion";

type RawParams = Record<string, string | string[] | undefined>;

const parseSettingsSection = (params: RawParams): SettingsSection | undefined => {
  const raw = params[SECTION_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (SETTINGS_SECTIONS as readonly string[]).includes(value ?? "") ? (value as SettingsSection) : undefined;
};

export type { SettingsSection };
export { SETTINGS_SECTIONS, SECTION_PARAM, parseSettingsSection };
