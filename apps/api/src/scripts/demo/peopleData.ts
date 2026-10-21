/** Demo people and addresses. Every email ends in DEMO_EMAIL_SUFFIX, so they are recognizable at a glance. */

const DEMO_EMAIL_SUFFIX = ".demo@example.com";
/** Meets the account policy (10+ chars, upper, lower, digit): every demo customer can log in with it. */
const DEMO_CUSTOMER_PASSWORD = "GiraDemo2026";

const FIRST_NAMES = [
  "Ana", "Luis", "María", "Carlos", "Sofía", "Diego", "Valeria", "Jorge", "Fernanda", "Andrés",
  "Camila", "Ricardo", "Daniela", "Emilio", "Regina", "Pablo", "Ximena", "Héctor", "Paola", "Iván",
  "Lucía", "Mateo", "Renata", "Santiago", "Natalia", "Tomás", "Mariana", "Rodrigo", "Elena", "Gael",
];

const LAST_NAMES = [
  "Pérez", "García", "Hernández", "López", "Martínez", "González", "Rodríguez", "Sánchez", "Ramírez", "Cruz",
  "Flores", "Gómez", "Morales", "Vázquez", "Jiménez", "Reyes", "Díaz", "Torres", "Gutiérrez", "Ruiz",
];

interface DemoAddress {
  line1: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
}

const ADDRESSES: DemoAddress[] = [
  { line1: "Av. Álvaro Obregón 120", district: "Roma Norte", city: "Ciudad de México", state: "CX", postalCode: "06700" },
  { line1: "Calle Amsterdam 55", district: "Hipódromo", city: "Ciudad de México", state: "CX", postalCode: "06100" },
  { line1: "Av. Universidad 1330", district: "Del Carmen", city: "Ciudad de México", state: "CX", postalCode: "04100" },
  { line1: "Av. Chapultepec 480", district: "Americana", city: "Guadalajara", state: "JC", postalCode: "44160" },
  { line1: "Calle López Cotilla 1520", district: "Lafayette", city: "Guadalajara", state: "JC", postalCode: "44140" },
  { line1: "Av. Constitución 300", district: "Centro", city: "Monterrey", state: "NL", postalCode: "64000" },
  { line1: "Calzada del Valle 400", district: "Del Valle", city: "San Pedro Garza García", state: "NL", postalCode: "66220" },
  { line1: "Calle 60 498", district: "Centro", city: "Mérida", state: "YU", postalCode: "97000" },
  { line1: "Av. Juárez 2915", district: "La Paz", city: "Puebla", state: "PU", postalCode: "72160" },
  { line1: "Calle Hidalgo 22", district: "Centro", city: "Querétaro", state: "QT", postalCode: "76000" },
  { line1: "Av. Tulum 200", district: "Centro", city: "Cancún", state: "QR", postalCode: "77500" },
  { line1: "Calle Macedonio Alcalá 400", district: "Centro", city: "Oaxaca de Juárez", state: "OA", postalCode: "68000" },
  { line1: "Paseo de la Presa 80", district: "Centro", city: "Guanajuato", state: "GT", postalCode: "36000" },
  { line1: "Av. Morelos 150", district: "Centro", city: "Toluca", state: "MX", postalCode: "50000" },
];

export type { DemoAddress };
export { DEMO_EMAIL_SUFFIX, DEMO_CUSTOMER_PASSWORD, FIRST_NAMES, LAST_NAMES, ADDRESSES };
