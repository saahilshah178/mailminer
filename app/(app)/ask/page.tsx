import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { SearchBar } from "@/components/search-bar";
import { getUserById } from "@/lib/db/users";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const user = await getUserById(userId);
  if (!user) redirect("/");
  if (user.sync_status === "pending" || user.sync_status === "failed") {
    redirect("/sync");
  }

  const { q } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-10">
      <div className="mb-8 flex items-center gap-2 text-[#0b57d0]">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#e8f0fe]">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">Inbox AI</span>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-[#202124]">
        Ask anything about your inbox
      </h1>
      <p className="mt-2 text-sm text-[#5f6368]">
        Plain-English questions only. We&apos;ll search your mail and cite the messages we used.
      </p>
      <div className="mt-8">
        <SearchBar initialQuery={q ?? ""} />
      </div>
    </div>
  );
}
