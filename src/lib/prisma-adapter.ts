import type { Adapter } from "next-auth/adapters";
import type { PrismaClient } from "./prisma-client";

type Unimplemented = (...args: any[]) => Promise<never>;

const createUnimplemented = (name: string): Unimplemented => {
  return async () => {
    throw new Error(`${name} is not implemented in the test environment.`);
  };
};

export function PrismaAdapter(_prisma: PrismaClient): Adapter {
  const unimplemented = (method: string) => createUnimplemented(`PrismaAdapter.${method}`);

  return {
    createUser: unimplemented("createUser"),
    getUser: unimplemented("getUser"),
    getUserByEmail: unimplemented("getUserByEmail"),
    createSession: unimplemented("createSession"),
    getSessionAndUser: unimplemented("getSessionAndUser"),
    updateUser: unimplemented("updateUser"),
    updateSession: unimplemented("updateSession"),
    deleteSession: unimplemented("deleteSession"),
    linkAccount: unimplemented("linkAccount"),
    unlinkAccount: unimplemented("unlinkAccount"),
    getUserByAccount: unimplemented("getUserByAccount"),
    createVerificationToken: unimplemented("createVerificationToken"),
    useVerificationToken: unimplemented("useVerificationToken"),
    deleteUser: unimplemented("deleteUser"),
    getVerificationToken: unimplemented("getVerificationToken")
  } satisfies Adapter;
}
