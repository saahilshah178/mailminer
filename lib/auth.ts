import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertUser } from "@/lib/db/users";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const { handlers, auth, signIn, signOut } = NextAuth({
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

      if (token.expires_at && Date.now() < token.expires_at * 1000) {
        return token;
      }

      // Token expired — try to refresh.
      if (!token.refresh_token) {
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
            refresh_token: token.refresh_token,
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
      if (token.userId) {
        session.user.id = token.userId;
      }
      if (token.access_token) {
        session.accessToken = token.access_token;
      }
      if (token.error) {
        session.error = token.error;
      }
      return session;
    },
  },
});
