import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware() {
    // Route-level handlers do per-request authorization.
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow API requests that present a Bearer token to pass through the
        // session gate; the individual route will validate the PAT via
        // `requireAuth`. This is needed so CI pipelines can call the API
        // without a NextAuth session cookie.
        if (req.nextUrl.pathname.startsWith("/api/")) {
          const authHeader = req.headers.get("authorization");
          if (authHeader?.startsWith("Bearer ")) return true;
        }
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
    // Protect all API routes except /api/auth/* and /api/health
    "/api/((?!auth|health).*)",
  ],
};
