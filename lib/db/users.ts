import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/encryption";
import type { SyncStatus, User } from "@/types";

export interface UpsertUserInput {
  email: string;
  name?: string | null;
  image?: string | null;
  refreshToken?: string | null;
}

/**
 * Upsert a user by email. If `refreshToken` is provided, encrypt and store it.
 * Returns the user row with id.
 */
export async function upsertUser(input: UpsertUserInput): Promise<User> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: selErr } = await supabase
    .from("users")
    .select("*")
    .eq("email", input.email)
    .maybeSingle();

  if (selErr) {
    console.error("upsertUser select failed", { email: input.email, error: selErr.message });
    throw new Error("Failed to look up user");
  }

  const update: Record<string, unknown> = {
    name: input.name ?? null,
    image: input.image ?? null,
  };
  if (input.refreshToken) {
    update.google_refresh_token = encrypt(input.refreshToken);
  }

  if (existing) {
    const { data, error } = await supabase
      .from("users")
      .update(update)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      console.error("upsertUser update failed", { userId: existing.id, error: error.message });
      throw new Error("Failed to update user");
    }
    return data as User;
  }

  const { data, error } = await supabase
    .from("users")
    .insert({
      email: input.email,
      ...update,
      sync_status: "pending" as SyncStatus,
    })
    .select("*")
    .single();
  if (error) {
    console.error("upsertUser insert failed", { email: input.email, error: error.message });
    throw new Error("Failed to create user");
  }
  return data as User;
}

export async function getUserById(userId: string): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("getUserById failed", { userId, error: error.message });
    throw new Error("Failed to load user");
  }
  return (data as User | null) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.error("getUserByEmail failed", { error: error.message });
    throw new Error("Failed to load user");
  }
  return (data as User | null) ?? null;
}

export async function getDecryptedRefreshToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("google_refresh_token")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("getDecryptedRefreshToken failed", { userId, error: error.message });
    throw new Error("Failed to load refresh token");
  }
  if (!data?.google_refresh_token) return null;
  try {
    return decrypt(data.google_refresh_token as string);
  } catch (err) {
    console.error("decrypt refresh token failed", { userId });
    throw new Error("Failed to decrypt refresh token");
  }
}

export async function setSyncStatus(
  userId: string,
  status: SyncStatus,
  progress?: { count?: number; total?: number },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = { sync_status: status };
  if (status === "complete") update.last_sync_at = new Date().toISOString();
  if (progress?.count !== undefined) update.sync_progress_count = progress.count;
  if (progress?.total !== undefined) update.sync_progress_total = progress.total;
  const { error } = await supabase.from("users").update(update).eq("id", userId);
  if (error) {
    console.error("setSyncStatus failed", { userId, status, error: error.message });
    throw new Error("Failed to update sync status");
  }
}

export async function setLastHistoryId(userId: string, historyId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({ last_history_id: historyId })
    .eq("id", userId);
  if (error) {
    console.error("setLastHistoryId failed", { userId, error: error.message });
    throw new Error("Failed to update history id");
  }
}

export async function listActiveUserIds(): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("sync_status", "complete");
  if (error) {
    console.error("listActiveUserIds failed", { error: error.message });
    throw new Error("Failed to list active users");
  }
  return (data ?? []).map((row) => row.id as string);
}
