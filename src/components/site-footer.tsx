import Link from "next/link";
import { cacheLife } from "next/cache";

export async function SiteFooter() {
  "use cache";
  cacheLife("days");

  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} AllMRR. Verified startup revenue.</p>
        <nav className="flex gap-4">
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
