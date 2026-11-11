"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

interface CouponFieldProps {
  /** The code the server accepted, if any. */
  applied: string | null;
  error: string | null;
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => void;
}

/**
 * Coupon code: applied against the server's preview, so the amount it takes off is always the real one. Applying
 * and removing swap the focused control for the other one, so focus follows: to «Quitar cupón» once applied, back to
 * the field once removed.
 */
const CouponField = ({ applied, error, onApply, onRemove }: CouponFieldProps) => {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const wasApplied = useRef(applied !== null);

  useEffect(() => {
    const before = wasApplied.current;
    wasApplied.current = applied !== null;
    if (before === (applied !== null)) return;
    rootRef.current?.querySelector<HTMLElement>(applied ? "button" : "input")?.focus();
  }, [applied]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const value = code.trim();
    if (value === "" || pending) return;
    setPending(true);
    try {
      if ((await onApply(value)) === null) setCode("");
    } finally {
      setPending(false);
    }
  };

  return (
    <div ref={rootRef}>
      {applied ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            Cupón <b className="font-mono">{applied}</b> aplicado
          </span>
          <Button type="button" variant="danger" size="sm" onClick={onRemove}>
            Quitar cupón
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate className="flex items-start gap-2">
          <Field
            label="Cupón"
            value={code}
            error={error ?? undefined}
            autoCapitalize="characters"
            autoComplete="off"
            containerClassName="flex-1"
            onChange={(event) => setCode(event.target.value)}
          />
          {/* `aria-disabled`, not `disabled`: a disabled button drops keyboard focus. */}
          <Button type="submit" variant="positive" aria-disabled={pending || undefined} aria-busy={pending || undefined} className="mt-[1.6rem]">
            {pending ? "Aplicando…" : "Aplicar"}
          </Button>
        </form>
      )}
    </div>
  );
};

export { CouponField };
