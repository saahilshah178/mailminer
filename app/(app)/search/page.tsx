import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { RecentThreads } from "@/components/recent-threads";
import { getUserById } from "@/lib/db/users";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const user = await getUserById(userId);
  if (!user) redirect("/");
  if (user.sync_status === "pending" || user.sync_status === "failed") {
    redirect("/sync");
  }
  // Allow in_progress users in once at least 1000 emails are indexed; otherwise
  // bounce them back to the sync page (handled by the layout there).

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">What do you want to know?</h1>
        <p className="text-sm text-muted-foreground">
          Ask in plain English. We&apos;ll search your inbox and cite the emails we used.
        </p>
      </div>

      <SearchBar />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Recent threads
        </h2>
        <RecentThreads userId={userId} />
      </section>
    </div>
  );
}
