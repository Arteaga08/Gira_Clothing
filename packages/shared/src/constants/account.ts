/** Profile limits shared by the API validator and the storefront form. */
const CITY_MAX_LENGTH = 120;
/** Earliest accepted birth date (`YYYY-MM-DD`); the latest is today. */
const BIRTH_DATE_MIN = "1900-01-01";

/** Saved shipping addresses per customer (M15c). */
const SAVED_ADDRESSES_MAX = 5;
const ADDRESS_LABEL_MAX_LENGTH = 40;

/** Mexican RFC: 3 letters (moral) or 4 (física), a 6-digit date and a 3-character homoclave. */
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const LEGAL_NAME_MAX_LENGTH = 300;

interface SatCatalogEntry {
  code: string;
  name: string;
}

/** SAT régimen fiscal: the subset that makes sense for an individual or small business buying clothing. */
const FISCAL_REGIMES: readonly SatCatalogEntry[] = [
  { code: "601", name: "General de Ley Personas Morales" },
  { code: "603", name: "Personas Morales con Fines no Lucrativos" },
  { code: "605", name: "Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { code: "606", name: "Arrendamiento" },
  { code: "612", name: "Personas Físicas con Actividades Empresariales y Profesionales" },
  { code: "616", name: "Sin obligaciones fiscales" },
  { code: "621", name: "Incorporación Fiscal" },
  { code: "625", name: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { code: "626", name: "Régimen Simplificado de Confianza" },
];

/** SAT uso de CFDI. */
const CFDI_USES: readonly SatCatalogEntry[] = [
  { code: "G01", name: "Adquisición de mercancías" },
  { code: "G03", name: "Gastos en general" },
  { code: "S01", name: "Sin efectos fiscales" },
];

const FISCAL_REGIME_CODES: readonly string[] = FISCAL_REGIMES.map((entry) => entry.code);
const CFDI_USE_CODES: readonly string[] = CFDI_USES.map((entry) => entry.code);

export type { SatCatalogEntry };
export {
  CITY_MAX_LENGTH,
  BIRTH_DATE_MIN,
  SAVED_ADDRESSES_MAX,
  ADDRESS_LABEL_MAX_LENGTH,
  RFC_PATTERN,
  LEGAL_NAME_MAX_LENGTH,
  FISCAL_REGIMES,
  CFDI_USES,
  FISCAL_REGIME_CODES,
  CFDI_USE_CODES,
};
