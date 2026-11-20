import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authRateLimiter } from "@/lib/rate-limit";
import type { Role } from "@prisma/client";
import type { JWT } from "next-auth/jwt";
import type { Session, DefaultUser, Account, Profile } from "next-auth";

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
            const normalizedEmail = credentials.email.trim().toLowerCase();
            const rl = await authRateLimiter.checkAsync(`cred:${normalizedEmail}`);
            if (!rl.success) {
              throw new Error("Too many login attempts. Please try again later.");
            }
            const user = await prisma.user.findUnique({
              where: { email: normalizedEmail },
            });
            if (!user || !user.password) return null;
            const valid = await bcrypt.compare(credentials.password, user.password);
            if (!valid) return null;
            if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerified) {
              throw new Error("EMAIL_NOT_VERIFIED");
            }
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
    async signIn({ account, profile }: { account: Account | null; profile?: Profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as (Profile & { email_verified?: boolean }) | undefined;
        if (googleProfile?.email_verified !== true) {
          return false;
        }
        const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;
        if (allowedDomain) {
          return googleProfile?.email?.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`) ?? false;
        }
        return true;
      }
      return true;
    },
    async jwt({ token, user, trigger }: { token: JWT; user?: (DefaultUser & { role?: Role }) | null; trigger?: string }): Promise<JWT> {
      if (user) {
        token.id = (user as any).id as string;
        (token as any).role = user.role as Role | undefined;
        (token as any).roleRefreshedAt = Date.now();
        delete (token as any).revoked;
      }

      // Refresh role from DB periodically so permission changes and deletions
      // take effect without waiting for the cookie lifetime to expire.
      const refreshIntervalMs = 5 * 60 * 1000;
      const last = (token as any).roleRefreshedAt as number | undefined;
      const needsRefresh =
        trigger === "update" || !last || Date.now() - last > refreshIntervalMs;

      if (needsRefresh && token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          });
          if (dbUser) {
            (token as any).role = dbUser.role;
            (token as any).roleRefreshedAt = Date.now();
          } else {
            // User was deleted: invalidate the JWT session
            delete (token as any).id;
            delete (token as any).role;
            (token as any).revoked = true;
          }
        } catch {
          // Swallow DB errors during refresh; fall back to the existing token.
        }
      }

      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }): Promise<Session> {
      if ((token as any).revoked || !token.id) {
        (session as any).user = undefined;
        return session;
      }
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
  secret: process.env.NEXTAUTH_SECRET,
};


