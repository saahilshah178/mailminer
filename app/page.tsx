import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/search");
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mx-auto w-full max-w-xl space-y-10 text-center">
        <div className="space-y-4">
          <h1 className="text-5xl font-semibold tracking-tight">Inbox AI</h1>
          <p className="text-lg text-muted-foreground">Ask your inbox anything.</p>
        </div>
        <SignInButton />
        <p className="text-xs text-muted-foreground">
          We read your email to answer your questions. We never share or sell your data.
        </p>
      </div>
    </main>
  );
}
