import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount: number;
  // Builds the href for a given page, keeping any active filters.
  hrefFor: (page: number) => string;
};

export function Pagination({ page, pageCount, hrefFor }: Props) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Button variant="outline" size="sm" render={<Link href={hrefFor(page - 1)} rel="prev" />}>
          <ChevronLeftIcon aria-hidden="true" />
          Previous
        </Button>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Button variant="outline" size="sm" render={<Link href={hrefFor(page + 1)} rel="next" />}>
          Next
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function parsePage(value: string | string[] | undefined) {
  const page = Number(typeof value === "string" ? value : 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
