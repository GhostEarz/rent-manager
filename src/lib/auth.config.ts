import type { NextAuthConfig } from "next-auth";

// Edge-safe part of the auth config (used by middleware). No DB / bcrypt imports here.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      if (path.startsWith("/api/cron")) return true; // protected by CRON_SECRET instead
      if (path === "/login") return !auth?.user ? true : Response.redirect(new URL("/dashboard", request.nextUrl));
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id: string }).id;
        token.role = (user as { role: "ADMIN" | "STAFF" }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as "ADMIN" | "STAFF";
      return session;
    },
  },
} satisfies NextAuthConfig;
