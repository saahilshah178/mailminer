import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    accessToken?: string;
    error?: "RefreshTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    error?: "RefreshTokenError";
  }
}
