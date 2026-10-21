"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import type { PanelTaxon } from "@/lib/taxonomy/panelTaxon";

interface RetireTaxonSectionProps {
  config: TaxonConfig;
  taxon: PanelTaxon;
  /** The API's message from the last retire/reactivate that failed (a 409 while children are active). */
  error: string | null;
  /** Never throws: resolves `false` on failure and the caller keeps the message in `error`. */
  onRetire: () => Promise<boolean>;
  onReactivate: () => Promise<boolean>;
}

/**
 * Retiring is a soft delete the API only allows once no child is active. The
 * modal mirrors that rule up front: it blocks, says why, names the children
 * that still use the record and links to where they are managed, instead of
 * letting the operator hit the 409. Reactivating has no parent to check.
 */
const RetireTaxonSection = ({ config, taxon, error, onRetire, onReactivate }: RetireTaxonSectionProps) => {
  const [confirming, setConfirming] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const { child } = config;

  const errorNotice = error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;

  if (!taxon.isActive) {
    return (
      <section className="flex flex-col gap-3 border-t-2 border-ink pt-4" aria-label={`${config.title}: retirada`}>
        <Notice variant="info" title={`Esta ${config.singular} está retirada`}>
          <p>No se ofrece al crear {child.plural}. Reactívala para volver a usarla.</p>
        </Notice>
        <div>
          <Button
            loading={reactivating}
            onClick={() => {
              setReactivating(true);
              void onReactivate().finally(() => setReactivating(false));
            }}
          >
            Reactivar {config.singular}
          </Button>
        </div>
        {errorNotice}
      </section>
    );
  }

  const blocked = taxon.activeChildCount > 0;
  const hidden = taxon.activeChildCount - taxon.activeChildren.length;

  return (
    <section className="flex flex-col gap-3 border-t-2 border-ink pt-4" aria-label={`Retirar ${config.singular}`}>
      {blocked ? (
        <Notice variant="warning" title="No se puede retirar todavía">
          <p>
            Tiene {child.activeCount(taxon.activeChildCount)}. {child.retireFirst} y después podrás retirar la{" "}
            {config.singular}.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {taxon.activeChildren.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={config.childHref(entry.id)}
                  className="flex items-center justify-between gap-2 rounded-nb-sm border-2 border-ink bg-surface px-3 py-1.5 font-bold underline-offset-2 hover:underline"
                >
                  {entry.name}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
            {hidden > 0 ? <li className="px-1 text-xs">y {hidden} más</li> : null}
          </ul>
          <p className="mt-3">
            <Link href={config.childrenHref(taxon.id)} className="font-bold underline">
              {child.seeAll(taxon.activeChildCount)}
            </Link>
          </p>
        </Notice>
      ) : (
        <p className="text-sm text-text-secondary">
          Dejará de ofrecerse al crear {child.plural}. Podrás reactivarla después.
        </p>
      )}
      <div>
        <Button variant="danger" disabled={blocked} onClick={() => setConfirming(true)}>
          Retirar {config.singular}
        </Button>
      </div>
      {errorNotice}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={`Retirar «${taxon.name}»`}
        description={`Dejará de ofrecerse al crear ${child.plural}. Podrás reactivarla después.`}
        confirmLabel={`Retirar ${config.singular}`}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await onRetire();
        }}
      />
    </section>
  );
};

export type { RetireTaxonSectionProps };
export { RetireTaxonSection };
