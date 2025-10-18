// src/types/next-auth.d.ts
// BEFORE:
// import NextAuth, { DefaultSession, DefaultUser } from "next-auth";

// AFTER:
import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: DefaultSession["user"] & {
      id: string;
      role?: "ADMIN" | "LEAD" | "TESTER" | "VIEWER";
    };
  }

  interface User extends DefaultUser {
    role?: "ADMIN" | "LEAD" | "TESTER" | "VIEWER";
  }
}
