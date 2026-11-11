interface TermsCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Terms and privacy open in a new tab so reading them never loses the order being built. */
const TermsCheck = ({ checked, onChange }: TermsCheckProps) => (
  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-6 shrink-0 cursor-pointer accent-brand" />
    <span>
      Acepto los{" "}
      <a href="/terminos" target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4">
        términos y condiciones
      </a>{" "}
      y el{" "}
      <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4">
        aviso de privacidad
      </a>
      .
    </span>
  </label>
);

export { TermsCheck };
