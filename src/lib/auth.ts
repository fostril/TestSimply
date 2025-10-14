import { PrismaAdapter } from "@/lib/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

const emailPasswordEnabled = process.env.EMAIL_PASSWORD_DISABLED !== "true";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(emailPasswordEnabled
      ? [
          CredentialsProvider({
            name: "Email",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
              if (!credentials?.email || !credentials.password) {
                return null;
              }
              const user = await prisma.user.findUnique({ where: { email: credentials.email } });
              if (!user || !user.password) return null;
              const valid = await bcrypt.compare(credentials.password, user.password);
              if (!valid) return null;
              return user;
            }
          })
        ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID ?? "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ""
          })
        ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
          })
        ]
      : [])
  ],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role as Role;
      }
      return session;
    }
  },
  pages: {
    signIn: "/auth/login"
  }
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
