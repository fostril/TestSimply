import { Prisma, Role } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { defaultRateLimiter, type RateLimitResult } from "@/lib/rate-limit";

type DefaultSession = {
  user: {
    id: string;
    name: string;
    email: string | null;
    role: Role;
  };
};

const DEFAULT_SESSION: DefaultSession = {
  user: {
    id: "public-user",
    name: "Public User",
    email: null,
    role: Role.ADMIN,
  },
};

type RequireAuthSuccess = {
  authorized: true;
  session: DefaultSession;
};

type RequireAuthFailure = {
  authorized: false;
  session: DefaultSession;
  response: NextResponse;
};

type RequireAuthResult = RequireAuthSuccess | RequireAuthFailure;

export async function requireAuth(req: NextRequest, action?: unknown): Promise<RequireAuthResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    console.log("[Auth] Unauthorized access attempt:", req.nextUrl.pathname);
    console.log("[Auth] Session:", session);
    return {
      authorized: false,
      session: { user: { ...DEFAULT_SESSION.user } },
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    authorized: true,
    session: session as unknown as DefaultSession,
  };
}

/**
 * Get client IP from request headers.
 */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

type RouteHandler<TContext> = (
  req: NextRequest,
  context: TContext
) => Promise<Response | NextResponse> | Response | NextResponse;

type RouteHandlerReturn<TContext> = (
  req: NextRequest,
  context: TContext
) => Promise<Response | NextResponse>;

interface ApiHandlerOptions {
  /** Disable rate limiting for this endpoint */
  skipRateLimit?: boolean;
}

const databaseUnavailable = (message?: string) =>
  NextResponse.json(
    {
      error: "Database unavailable",
      message: "Unable to connect to the database. Ensure the Postgres instance is running and reachable.",
      details: message,
    },
    { status: 503 }
  );

const rateLimitExceeded = (result: RateLimitResult) =>
  NextResponse.json(
    {
      error: "Too many requests",
      message: "Rate limit exceeded. Please try again later.",
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
        "Retry-After": String(result.retryAfter ?? 60),
      },
    }
  );

export function withApiHandler<TContext = Record<string, unknown>>(
  handler: RouteHandler<TContext>,
  options: ApiHandlerOptions = {}
): RouteHandlerReturn<TContext> {
  return async (req, context) => {
    // Rate limiting (can be disabled per-endpoint)
    if (!options.skipRateLimit) {
      const clientIp = getClientIp(req);
      const rateLimitResult = defaultRateLimiter.check(clientIp);

      if (!rateLimitResult.success) {
        console.log(`[RateLimit] Blocked request from ${clientIp}`);
        return rateLimitExceeded(rateLimitResult);
      }
    }

    try {
      return await handler(req, context);
    } catch (error) {
      console.error(
        `[api] ${req.method} ${req.nextUrl.pathname} failed:`,
        error
      );

      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Invalid request payload",
            issues: error.issues,
          },
          { status: 400 }
        );
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return NextResponse.json(
            {
              error: "Unique constraint violation",
              target: error.meta?.target ?? [],
            },
            { status: 409 }
          );
        }

        if (error.code === "P2003") {
          return NextResponse.json(
            {
              error: "Invalid reference",
              message: "The operation references a record that does not exist.",
              target: error.meta?.field_name ?? [],
            },
            { status: 400 }
          );
        }

        return NextResponse.json(
          {
            error: "Database request failed",
            code: error.code,
          },
          { status: 500 }
        );
      }

      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientRustPanicError
      ) {
        return databaseUnavailable(error.message);
      }

      if (error instanceof Prisma.PrismaClientValidationError) {
        return NextResponse.json(
          {
            error: "Invalid database query",
            message: error.message,
          },
          { status: 400 }
        );
      }

      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        return NextResponse.json(
          {
            error: "Database request failed",
            message: error.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: "Internal server error",
        },
        { status: 500 }
      );
    }
  };
}

