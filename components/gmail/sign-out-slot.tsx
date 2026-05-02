import { signOut } from "@/lib/auth";
import { LogOut } from "lucide-react";

export function GmailSignOutSlot() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-white"
      >
        <LogOut className="h-4 w-4 text-[#5f6368]" />
        Sign out
      </button>
    </form>
  );
}
