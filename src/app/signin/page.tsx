import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-sm w-full space-y-6 text-center px-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Logger.ai</h1>
          <p className="text-muted-foreground text-sm">
            Sign in to access your family log
          </p>
        </div>
        {error === "AccessDenied" && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
            <p className="text-sm text-destructive">
              Access denied. This app is restricted to authorized family members.
            </p>
          </div>
        )}
        <SignInButton />
      </div>
    </div>
  );
}
