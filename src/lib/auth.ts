import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import type { JWT } from "next-auth/jwt";
import type { Session, DefaultUser } from "next-auth";

const emailPasswordEnabled = process.env.EMAIL_PASSWORD_DISABLED !== "true";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" as const },
  providers: [
    ...(emailPasswordEnabled
      ? [
        CredentialsProvider({
          name: "Email",
          credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
          },
          async authorize(credentials) {
            if (!credentials?.email || !credentials.password) return null;
            const user = await prisma.user.findUnique({
              where: { email: credentials.email },
            });
            if (!user || !user.password) return null;
            const valid = await bcrypt.compare(credentials.password, user.password);
            if (!valid) return null;
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role as Role | undefined,
            } as DefaultUser & { role?: Role };
          },
        }),
      ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID
      ? [
        GitHubProvider({
          clientId: process.env.GITHUB_CLIENT_ID ?? "",
          clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
        }),
      ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
      ]
      : []),
  ],
  callbacks: {
    async jwt(
      { token, user }: { token: JWT; user?: (DefaultUser & { role?: Role }) | null }
    ): Promise<JWT> {
      if (user) {
        token.id = (user as any).id as string;
        (token as any).role = user.role as Role | undefined;
      }
      return token;
    },
    async session(
      { session, token }: { session: Session; token: JWT }
    ): Promise<Session> {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = (token as any).role as Role | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
