"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";

interface CustomerSearchProps {
  value: string | undefined;
  onChange: (search: string | undefined) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Debounced search (300 ms). The URL is the source of truth: a change from outside
 * pulls the box along without clobbering what the operator is still typing.
 */
const CustomerSearch = ({ value, onChange }: CustomerSearchProps) => {
  const [searchText, setSearchText] = useState(value ?? "");
  const [seenValue, setSeenValue] = useState(value);

  if (value !== seenValue) {
    setSeenValue(value);
    setSearchText((typed) => ((value ?? "") === typed.trim() ? typed : (value ?? "")));
  }

  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === (value ?? "")) return;
    const timer = setTimeout(() => onChange(trimmed || undefined), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, value, onChange]);

  return (
    <Field
      label="Buscar"
      placeholder="Busca por nombre o correo"
      icon={MagnifyingGlassIcon}
      value={searchText}
      maxLength={80}
      onChange={(event) => setSearchText(event.target.value)}
      containerClassName="w-full sm:w-72"
    />
  );
};

export type { CustomerSearchProps };
export { CustomerSearch };
