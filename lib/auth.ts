import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertUser } from "@/lib/db/users";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function resolveAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-placeholder-set-auth-secret-in-env-local";
  }
  // `next build` runs route workers with NODE_ENV=production; argv may not include "build".
  console.error(
    "[auth] AUTH_SECRET is unset. Sessions are insecure until you set AUTH_SECRET (see .env.example).",
  );
  return "insecure-placeholder-you-must-set-auth-secret";
}

const authSecret = resolveAuthSecret();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  // Required for Auth.js on localhost and behind proxies; avoids generic "server configuration" errors.
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
          scope: `openid email profile ${GMAIL_SCOPE}`,
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;
      if (!user.email) return false;
      try {
        const dbUser = await upsertUser({
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
          refreshToken: account.refresh_token ?? null,
        });
        // Stash the DB user id on the user so the jwt callback can read it.
        (user as { dbId?: string }).dbId = dbUser.id;
      } catch (err) {
        console.error("signIn upsertUser failed", err);
        return false;
      }
      return true;
    },
    async jwt({ token, account, user }) {
      // First sign-in: persist tokens on the JWT.
      if (account && user) {
        token.userId = (user as { dbId?: string }).dbId ?? token.userId;
        if (account.access_token) token.access_token = account.access_token;
        if (account.expires_at) token.expires_at = account.expires_at;
        if (account.refresh_token) token.refresh_token = account.refresh_token;
        return token;
      }

      const expAt = token.expires_at;
      if (typeof expAt === "number" && Date.now() < expAt * 1000) {
        return token;
      }

      // Token expired — try to refresh.
      const refreshToken =
        typeof token.refresh_token === "string" ? token.refresh_token : undefined;
      if (!refreshToken) {
        token.error = "RefreshTokenError";
        return token;
      }
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID ?? "",
            client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });
        const tokens = (await res.json()) as {
          access_token?: string;
          expires_in?: number;
          refresh_token?: string;
          error?: string;
        };
        if (!res.ok || !tokens.access_token) throw tokens;
        token.access_token = tokens.access_token;
        token.expires_at = Math.floor(Date.now() / 1000 + (tokens.expires_in ?? 3600));
        if (tokens.refresh_token) token.refresh_token = tokens.refresh_token;
        return token;
      } catch (err) {
        console.error("token refresh failed", err);
        token.error = "RefreshTokenError";
        return token;
      }
    },
    async session({ session, token }) {
      const userId = token.userId;
      if (typeof userId === "string") {
        session.user.id = userId;
      }
      const accessToken = token.access_token;
      if (typeof accessToken === "string") {
        session.accessToken = accessToken;
      }
      if (token.error === "RefreshTokenError") {
        session.error = "RefreshTokenError";
      }
      return session;
    },
  },
});
