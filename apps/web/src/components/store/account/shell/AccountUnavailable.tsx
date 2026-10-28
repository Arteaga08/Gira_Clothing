import { LoadFailure } from "./LoadFailure";

/** Whole-area fallback when the session itself cannot be checked (API down): no sidebar, since there is no name to show. */
const AccountUnavailable = () => (
  <div className="mx-auto w-full max-w-[72rem] px-4 pb-14 pt-6 md:px-8">
    <div className="rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb-lg">
      <LoadFailure what="tu cuenta" />
    </div>
  </div>
);

export { AccountUnavailable };
