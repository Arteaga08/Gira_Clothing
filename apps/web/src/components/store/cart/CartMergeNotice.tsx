"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { droppedLinesMessage, onDroppedLines } from "@/lib/cart/mergeNotice";

/**
 * Tells the customer, once, that the login dropped cart lines whose product is gone. It lives in
 * the store layout, which stays mounted across the login redirect, and listens for the login's
 * announcement.
 */
const CartMergeNotice = () => {
  const [dropped, setDropped] = useState(0);

  useEffect(() => onDroppedLines(setDropped), []);

  if (dropped === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 pt-4 md:px-8">
      <Notice variant="warning" title="Cambió tu carrito">
        <p>{droppedLinesMessage(dropped)}</p>
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setDropped(0)}>
          Cerrar aviso
        </Button>
      </Notice>
    </div>
  );
};

export { CartMergeNotice };
