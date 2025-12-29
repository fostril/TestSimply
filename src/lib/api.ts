import { Prisma, Role } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

type RouteHandler<TContext> = (
  req: NextRequest,
  context: TContext
) => Promise<Response | NextResponse> | Response | NextResponse;

type RouteHandlerReturn<TContext> = (
  req: NextRequest,
  context: TContext
) => Promise<Response | NextResponse>;

const databaseUnavailable = (message?: string) =>
  NextResponse.json(
    {
      error: "Database unavailable",
      message: "Unable to connect to the database. Ensure the Postgres instance is running and reachable.",
      details: message,
    },
    { status: 503 }
  );

export function withApiHandler<TContext = Record<string, unknown>>(
  handler: RouteHandler<TContext>
): RouteHandlerReturn<TContext> {
  return async (req, context) => {
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
