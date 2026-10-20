interface MexicanState {
  code: string;
  name: string;
}

/** Codes are the 2-letter ones Envía uses for `state`; confirm against GET /state?country_code=MX in the sandbox. */
const MEXICAN_STATES: readonly MexicanState[] = [
  { code: "AG", name: "Aguascalientes" },
  { code: "BC", name: "Baja California" },
  { code: "BS", name: "Baja California Sur" },
  { code: "CM", name: "Campeche" },
  { code: "CS", name: "Chiapas" },
  { code: "CH", name: "Chihuahua" },
  { code: "CX", name: "Ciudad de México" },
  { code: "CO", name: "Coahuila" },
  { code: "CL", name: "Colima" },
  { code: "DG", name: "Durango" },
  { code: "GT", name: "Guanajuato" },
  { code: "GR", name: "Guerrero" },
  { code: "HG", name: "Hidalgo" },
  { code: "JC", name: "Jalisco" },
  { code: "MX", name: "Estado de México" },
  { code: "MI", name: "Michoacán" },
  { code: "MO", name: "Morelos" },
  { code: "NA", name: "Nayarit" },
  { code: "NL", name: "Nuevo León" },
  { code: "OA", name: "Oaxaca" },
  { code: "PU", name: "Puebla" },
  { code: "QT", name: "Querétaro" },
  { code: "QR", name: "Quintana Roo" },
  { code: "SL", name: "San Luis Potosí" },
  { code: "SI", name: "Sinaloa" },
  { code: "SO", name: "Sonora" },
  { code: "TB", name: "Tabasco" },
  { code: "TM", name: "Tamaulipas" },
  { code: "TL", name: "Tlaxcala" },
  { code: "VE", name: "Veracruz" },
  { code: "YU", name: "Yucatán" },
  { code: "ZA", name: "Zacatecas" },
];

const MEXICAN_STATE_CODES: readonly string[] = MEXICAN_STATES.map((s) => s.code);

const POSTAL_CODE_PATTERN = /^\d{5}$/;
/** Ten digits, no country code: what carriers require for contact. */
const PHONE_PATTERN = /^\d{10}$/;

export type { MexicanState };
export { MEXICAN_STATES, MEXICAN_STATE_CODES, POSTAL_CODE_PATTERN, PHONE_PATTERN };
