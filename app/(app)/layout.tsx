import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/search" className="font-semibold tracking-tight">
            Inbox AI
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
