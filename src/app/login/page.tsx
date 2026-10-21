import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginButtons } from "./login-buttons";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-20">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to AllMRR</CardTitle>
          <CardDescription>Add your startup and show verified revenue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense fallback={<LoginButtons next="/dashboard" />}>
            <LoginForm searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function LoginForm({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null, "/dashboard");

  return (
    <>
      {params.error === "auth" && (
        <p className="text-sm text-destructive">Sign-in failed. Please try again.</p>
      )}
      <LoginButtons next={next} />
    </>
  );
}
