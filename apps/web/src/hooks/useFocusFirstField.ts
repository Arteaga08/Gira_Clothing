import { useEffect, useRef } from "react";

/**
 * A form that replaces a button in place (edit, add) must take focus when it opens: the button
 * that opened it is gone, and a keyboard user would otherwise be left on <body>. Attach the ref to
 * the <form>; the first input gets focus on mount.
 */
const useFocusFirstField = () => {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input")?.focus();
  }, []);
  return ref;
};

export { useFocusFirstField };
