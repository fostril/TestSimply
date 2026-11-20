import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getClientIp } from "@/lib/api";
import { authRateLimiter } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

export { handler as GET };

export async function POST(
  req: NextRequest,
  context: { params: { nextauth: string[] } },
) {
  const isCredentialsCallback =
    req.nextUrl.pathname.endsWith("/callback/credentials") ||
    (Array.isArray(context?.params?.nextauth) &&
      context.params.nextauth[0] === "callback" &&
      context.params.nextauth[1] === "credentials");

  if (isCredentialsCallback) {
    const clientIp = getClientIp(req);
    const rl = await authRateLimiter.checkAsync(`login:${clientIp}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later.", retryAfter: rl.retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfter ?? 60),
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rl.reset),
          },
        },
      );
    }
  }

  return handler(req, context);
}
