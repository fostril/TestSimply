const createUnimplemented = (name) => {
  return async () => {
    throw new Error(`${name} is not implemented in the test environment.`);
  };
};

function PrismaAdapter() {
  const unimplemented = (method) => createUnimplemented(`PrismaAdapter.${method}`);

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
  };
}

module.exports = { PrismaAdapter };
