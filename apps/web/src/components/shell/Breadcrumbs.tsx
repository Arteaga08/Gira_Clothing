"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { breadcrumbsFor } from "@/lib/breadcrumbs";

const Breadcrumbs = () => {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);

  return (
    <nav aria-label="Ruta" className="flex items-center gap-2 px-4 pt-3 text-xs text-text-muted lg:px-6">
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-text-primary hover:underline">
              {crumb.label}
            </Link>
          ) : (
            <span aria-current="page" className="font-semibold text-text-primary">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
};

export { Breadcrumbs };
