import { redirect } from "next/navigation";
import { Sparkles, Inbox, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/inbox");
  }
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6f8fc]">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[1200px] -translate-x-1/2 rounded-[50%] bg-gradient-to-br from-rose-200/60 via-amber-100/60 to-blue-200/60 blur-3xl" />
      <div className="relative mx-auto flex max-w-6xl flex-col px-6 pt-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-rose-500 via-amber-400 to-emerald-500 text-base font-bold text-white">
              M
            </span>
            <span className="text-lg font-medium text-[#202124]">Inbox AI</span>
          </div>
        </header>

        <section className="mx-auto mt-24 grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#0b57d0] shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Your inbox, supercharged
            </span>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-[#202124] md:text-6xl">
              Read your email like Gmail.
              <span className="block text-[#0b57d0]">Ask it like ChatGPT.</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[#5f6368]">
              Inbox AI mirrors your Gmail inbox so you can read, scan and triage as
              usual — and search every conversation in plain English with cited
              answers.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <SignInButton />
              <p className="text-xs text-[#5f6368]">
                <ShieldCheck className="mr-1 inline h-3 w-3" />
                Read-only access. We never share or sell your data.
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-center gap-2 border-b bg-[#f6f8fc] px-3 py-2">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <span className="ml-3 text-xs text-[#5f6368]">inbox-ai.app/inbox</span>
              </div>
              <div className="grid grid-cols-[160px_1fr] text-xs">
                <div className="space-y-1 border-r bg-[#f6f8fc] p-3">
                  <div className="flex items-center gap-2 rounded-r-full bg-[#d3e3fd] px-3 py-1.5 font-bold text-[#001d35]">
                    <Inbox className="h-3.5 w-3.5" />
                    Inbox
                  </div>
                  <div className="px-3 py-1.5 text-[#3c4043]">Starred</div>
                  <div className="px-3 py-1.5 text-[#3c4043]">Sent</div>
                  <div className="px-3 py-1.5 text-[#0b57d0]">Ask AI</div>
                </div>
                <div className="divide-y">
                  {[
                    { from: "Stripe", subject: "Your weekly summary", snippet: "$12,431 collected this week" },
                    { from: "Linear", subject: "ENG-204 needs your review", snippet: "Andre commented on your task" },
                    { from: "Mom", subject: "Photos from Sunday", snippet: "Look at how big she's getting" },
                    { from: "Apple", subject: "Your iCloud receipt", snippet: "$2.99 for iCloud+ 50GB" },
                  ].map((row, i) => (
                    <div
                      key={row.subject}
                      className="grid grid-cols-[80px_1fr_40px] items-center gap-2 px-3 py-2"
                    >
                      <span className={i === 0 ? "font-semibold text-[#202124]" : "text-[#3c4043]"}>{row.from}</span>
                      <span className="truncate text-[#3c4043]">
                        <span className={i === 0 ? "font-semibold text-[#202124]" : ""}>
                          {row.subject}
                        </span>{" "}
                        - <span className="text-[#5f6368]">{row.snippet}</span>
                      </span>
                      <span className="text-right text-[#5f6368]">2:14 PM</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
