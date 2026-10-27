"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { PasswordStrength } from "./PasswordStrength";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: string | undefined;
  placeholder?: string;
  /** Shows the meter and checklist: only where a password is being chosen. */
  showStrength?: boolean;
}

const PasswordField = ({ label, value, onChange, autoComplete, error, placeholder, showStrength = false }: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={label}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        error={error}
        onChange={(event) => onChange(event.target.value)}
        {...(placeholder ? { placeholder } : {})}
        trailing={
          <IconButton
            variant="edit"
            size="sm"
            icon={visible ? EyeSlash : Eye}
            label="Mostrar contraseña"
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
          />
        }
      />
      {showStrength ? <PasswordStrength value={value} /> : null}
    </div>
  );
};

export { PasswordField };
