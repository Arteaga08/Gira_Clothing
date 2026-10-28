"use client";

import { useState, type FormEvent } from "react";
import { BIRTH_DATE_MIN, CITY_MAX_LENGTH, type AccountProfile, type Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { updateProfile } from "@/lib/api/account";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import {
  profileToValues,
  sanitizePhone,
  todayIso,
  validateProfile,
  valuesToRequest,
  type ProfileFormErrors,
  type ProfileFormValues,
} from "@/lib/account/profileValidation";
import { STORE_ROUTES } from "@/lib/store/routes";

interface ProfileFormProps {
  profile: Wire<AccountProfile>;
  onSaved: (profile: Wire<AccountProfile>) => void;
  onCancel: () => void;
}

/** Edit form of «Datos personales». The email is shown but never sent: it is the login and cannot change. */
const ProfileForm = ({ profile, onSaved, onCancel }: ProfileFormProps) => {
  const [values, setValues] = useState<ProfileFormValues>(() => profileToValues(profile));
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const { pending, error, setError, run } = useSubmit();

  const set = (key: keyof ProfileFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateProfile(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void run(
      async () => {
        onSaved(await updateProfile(valuesToRequest(values)));
      },
      {
        onError: (failure) => {
          if (isSessionExpired(failure)) goToLogin(STORE_ROUTES.profile);
          else setError(authFailureMessage(failure));
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {error ? (
        <Notice variant="danger" title="No pudimos guardar">
          {error}
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" autoComplete="given-name" value={values.firstName} error={errors.firstName} onChange={(e) => set("firstName")(e.target.value)} />
        <Field label="Apellido" autoComplete="family-name" value={values.lastName} error={errors.lastName} onChange={(e) => set("lastName")(e.target.value)} />
      </div>
      <Field label="Correo" type="email" value={profile.email} readOnly helper="Es tu acceso a la tienda y no se puede cambiar." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Celular (opcional)"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={values.phone}
          error={errors.phone}
          onChange={(e) => set("phone")(sanitizePhone(e.target.value))}
        />
        <Field
          label="Fecha de nacimiento (opcional)"
          type="date"
          autoComplete="bday"
          min={BIRTH_DATE_MIN}
          max={todayIso()}
          value={values.birthDate}
          error={errors.birthDate}
          onChange={(e) => set("birthDate")(e.target.value)}
        />
      </div>
      <Field
        label="Ciudad (opcional)"
        autoComplete="address-level2"
        maxLength={CITY_MAX_LENGTH}
        value={values.city}
        error={errors.city}
        onChange={(e) => set("city")(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={pending}>
          Guardar cambios
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

export { ProfileForm };
