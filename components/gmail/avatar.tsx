import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
];

function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function colorForKey(key: string | null | undefined): string {
  if (!key) return "bg-slate-500";
  return PALETTE[hashCode(key) % PALETTE.length];
}

export function initialFor(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name?.trim() || email?.trim() || "").trim();
  if (!source) return "?";
  const ch = source[0];
  return ch.toUpperCase();
}

export function GmailAvatar({
  name,
  email,
  size = 32,
  className,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
}) {
  const initial = initialFor(name, email);
  const color = colorForKey(email ?? name ?? "");
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        color,
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.floor(size / 2.4)) }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
