import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token }) => Boolean(token)
  }
});

export const config = {
  matcher: ["/((?!api|_next|static|auth|favicon.ico).*)"]
};
