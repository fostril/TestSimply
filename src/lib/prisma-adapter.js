function PrismaAdapter(prisma) {
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
      const { id, ...updateData } = data;
      return prisma.user.update({
        where: { id },
        data: updateData
      });
    },
    async deleteUser(id) {
      return prisma.user.delete({ where: { id } });
    },
    async linkAccount(account) {
      return prisma.account.create({ data: account });
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
  };
}

module.exports = { PrismaAdapter };
