import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    // console.log("[Middleware] Processing:", req.nextUrl.pathname);
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        return !!token;
      },
    },
    pages: {
      signIn: "/auth/login",
    },
    secret: process.env.NEXTAUTH_SECRET,
  }
);

export const config = {
  matcher: [
    "/",
    "/projects/:path*",
    "/settings/:path*",
    "/api/((?!auth).*)",
  ],
};
