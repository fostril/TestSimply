type AdapterAccount = {
  provider: string;
  providerAccountId: string;
  [key: string]: unknown;
};

type AdapterSession = {
  sessionToken: string;
  [key: string]: unknown;
};

type AdapterUser = {
  id: string;
  email?: string | null;
  [key: string]: unknown;
};

type Adapter = {
  createUser(data: AdapterUser): Promise<AdapterUser>;
  getUser(id: string): Promise<AdapterUser | null>;
  getUserByEmail(email: string | null | undefined): Promise<AdapterUser | null>;
  getUserByAccount(params: { provider: string; providerAccountId: string }): Promise<AdapterUser | null>;
  updateUser(data: AdapterUser): Promise<AdapterUser>;
  deleteUser(id: string): Promise<AdapterUser | null>;
  linkAccount(account: AdapterAccount): Promise<AdapterAccount>;
  unlinkAccount(params: { provider: string; providerAccountId: string }): Promise<void>;
  createSession(data: AdapterSession): Promise<AdapterSession>;
  getSessionAndUser(sessionToken: string): Promise<{ session: AdapterSession; user: AdapterUser } | null>;
  updateSession(data: AdapterSession): Promise<AdapterSession | null>;
  deleteSession(sessionToken: string): Promise<void>;
  createVerificationToken(token: Record<string, unknown>): Promise<Record<string, unknown>>;
  useVerificationToken(params: { identifier: string; token: string }): Promise<Record<string, unknown> | null>;
  getVerificationToken(params: { identifier: string; token: string }): Promise<Record<string, unknown> | null>;
};

import type { PrismaClient } from "./prisma-client";

export function PrismaAdapter(prisma: PrismaClient): Adapter {
  return {
    async createUser(data) {
      return prisma.user.create({ data });
    },
    async getUser(id) {
      return prisma.user.findUnique({ where: { id } });
    },
    async getUserByEmail(email) {
      if (!email) return null;
      return prisma.user.findUnique({ where: { email } });
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true }
      });
      return account?.user ?? null;
    },
    async updateUser(data) {
      if (!data.id) {
        throw new Error("User id is required to update user");
      }
      const { id, ...userData } = data;
      return prisma.user.update({
        where: { id },
        data: userData
      });
    },
    async deleteUser(id) {
      return prisma.user.delete({ where: { id } });
    },
    async linkAccount(account) {
      const created = await prisma.account.create({ data: account as AdapterAccount });
      return created as unknown as AdapterAccount;
    },
    async unlinkAccount({ provider, providerAccountId }) {
      try {
        await prisma.account.delete({
          where: { provider_providerAccountId: { provider, providerAccountId } }
        });
      } catch (error) {
        // ignore missing account
      }
    },
    async createSession(data) {
      return prisma.session.create({ data });
    },
    async getSessionAndUser(sessionToken) {
      const sessionWithUser = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true }
      });
      if (!sessionWithUser) return null;
      const { user, ...session } = sessionWithUser;
      return { user, session };
    },
    async updateSession(data) {
      try {
        return await prisma.session.update({
          where: { sessionToken: data.sessionToken },
          data
        });
      } catch (error) {
        return null;
      }
    },
    async deleteSession(sessionToken) {
      try {
        await prisma.session.delete({ where: { sessionToken } });
      } catch (error) {
        // ignore missing session
      }
    },
    async createVerificationToken(token) {
      return prisma.verificationToken.create({ data: token });
    },
    async useVerificationToken({ identifier, token }) {
      try {
        return await prisma.verificationToken.delete({
          where: { identifier_token: { identifier, token } }
        });
      } catch (error) {
        return null;
      }
    },
    async getVerificationToken({ identifier, token }) {
      return prisma.verificationToken.findUnique({
        where: { identifier_token: { identifier, token } }
      });
    }
  } satisfies Adapter;
}
