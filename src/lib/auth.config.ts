import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const authConfig = {
  session: { strategy: "jwt" as const },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email || !allowedEmails.includes(email)) {
        return false;
      }
      return true;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
