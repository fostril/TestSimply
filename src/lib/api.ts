import crypto from "crypto";
import { Prisma, Role } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, type Action } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { defaultRateLimiter, type RateLimitResult } from "@/lib/rate-limit";
import { apiLogger } from "@/lib/logger";
import { authenticateApiToken, isTokenScopeAllowed } from "@/lib/personal-token";

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export type AuthSession = {
  user: {
    id: string;
    name: string;
    email: string | null;
    role: Role;
  };
};

type RequireAuthSuccess = {
  authorized: true;
  session: AuthSession;
};

type RequireAuthFailure = {
  authorized: false;
  session: null;
  response: NextResponse;
};

type RequireAuthResult = RequireAuthSuccess | RequireAuthFailure;

/**
 * Authenticate the request, accepting either a NextAuth session cookie OR a
 * `Authorization: Bearer <personal-access-token>` header for programmatic
 * access (CI pipelines, scripts, etc.).
 *
 * When `action` is provided, RBAC is enforced against the authenticated user's
 * role (for PATs, we use the owning user's role).
 */
export async function requireAuth(req: NextRequest, action?: Action): Promise<RequireAuthResult> {
  // Prefer bearer token auth (no cookie -> stateless API clients)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const tokenAuth = await authenticateApiToken(authHeader);
    if (tokenAuth) {
      const pathname = req.nextUrl?.pathname ?? new URL(req.url).pathname;
      if (!isTokenScopeAllowed(tokenAuth.scopes, pathname)) {
        return {
          authorized: false,
          session: null,
          response: NextResponse.json(
            { error: "Forbidden: insufficient token scope" },
            { status: 403 },
          ),
        };
      }
      const typedSession: AuthSession = {
        user: {
          id: tokenAuth.user.id,
          name: "",
          email: null,
          role: tokenAuth.user.role,
        },
      };
      if (action && !can(typedSession.user.role, action)) {
        return {
          authorized: false,
          session: null,
          response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
      }
      return { authorized: true, session: typedSession };
    }
    // Bearer token was provided but invalid -> reject with 401 rather than
    // silently falling back to the cookie.
    return {
      authorized: false,
      session: null,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user || !(session.user as { id?: string }).id) {
    return {
      authorized: false,
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const typedSession = session as unknown as AuthSession;

  if (action && !can(typedSession.user.role, action)) {
    return {
      authorized: false,
      session: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    authorized: true,
    session: typedSession,
  };
}

// ---------------------------------------------------------------------------
// Project-level access isolation
// ---------------------------------------------------------------------------

/**
 * Check whether a user can access a specific project.
 * ADMINs can access every project. Other roles must be a member or lead.
 * Returns the project row when access is granted, or null otherwise.
 */
export async function requireProjectAccess(
  userId: string,
  role: Role,
  projectId: string,
): Promise<{ id: string; key: string } | null> {
  if (role === Role.ADMIN) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, key: true },
    });
    return project;
  }

  // Non-admin: must be a member or lead of the project
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { members: { some: { id: userId } } },
        { leads: { some: { id: userId } } },
      ],
    },
    select: { id: true, key: true },
  });
  return project;
}

/**
 * Convenience wrapper that returns a 403 NextResponse when access is denied.
 */
export async function requireProjectAccessOrForbid(
  userId: string,
  role: Role,
  projectId: string,
): Promise<{ id: string; key: string } | NextResponse> {
  const project = await requireProjectAccess(userId, role, projectId);
  if (!project) {
    return NextResponse.json(
      { error: "You do not have access to this project" },
      { status: 403 },
    );
  }
  return project;
}

/**
 * Verify the caller is a member/lead of the resource's project.
 * Returns `null` if authorized, or a NextResponse (404/403) if denied.
 *
 * We return 404 instead of 403 when the resource does not exist so callers
 * cannot enumerate resource IDs across projects (prevents info disclosure).
 */
export async function assertProjectAccessForResource(
  userId: string,
  role: Role,
  resource: { projectId: string } | null | undefined,
): Promise<NextResponse | null> {
  if (!resource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const access = await requireProjectAccess(userId, role, resource.projectId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

/**
 * Return the list of project IDs accessible to a non-ADMIN user, or `null` for ADMIN
 * (meaning all projects are accessible).
 */
export async function getAccessibleProjectIds(
  userId: string,
  role: Role,
): Promise<string[] | null> {
  if (role === Role.ADMIN) return null;
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { members: { some: { id: userId } } },
        { leads: { some: { id: userId } } },
      ],
    },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}

/**
 * Resolve a project-scoped entity by either its CUID `id` or its project-scoped `key`
 * (supporting both `"PROJ_TYPE_1"` and `"PROJ-TYPE-1"` formats, with or without `projectKey`).
 */
export async function resolveByIdOrKey<T>(
  findById: (id: string) => Promise<T | null>,
  findByProjectKey: (projectId: string, key: string) => Promise<T | null>,
  idOrKey: string,
  projectKey?: string | null,
): Promise<T | null> {
  const byId = await findById(idOrKey);
  if (byId) return byId;

  if (projectKey) {
    const project = await prisma.project.findFirst({
      where: { OR: [{ id: projectKey }, { key: projectKey }] },
      select: { id: true },
    });
    if (project) {
      const byKey = await findByProjectKey(project.id, idOrKey);
      if (byKey) return byKey;
    }
  }

  const seenProjectKeys = new Set<string>();
  for (const sep of ["_", "-"] as const) {
    const parts = idOrKey.split(sep);
    for (let i = 1; i < parts.length; i++) {
      const pKey = parts.slice(0, i).join(sep);
      if (seenProjectKeys.has(pKey)) continue;
      seenProjectKeys.add(pKey);
      const project = await prisma.project.findUnique({
        where: { key: pKey },
        select: { id: true },
      });
      if (!project) continue;
      const byFull = await findByProjectKey(project.id, idOrKey);
      if (byFull) return byFull;
      const suffix = parts.slice(i).join(sep);
      const bySuffix = await findByProjectKey(project.id, suffix);
      if (bySuffix) return bySuffix;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Extract pagination params from URL search params.
 * Defaults: page=1, limit=50. Max limit=200.
 */
export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_PAGE_SIZE));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Return a paginated array response.
 *
 * The body is the raw array (backward compatible with existing clients that
 * expect `T[]`). Pagination metadata is exposed via response headers so newer
 * UIs can implement pagination without breaking older consumers.
 */
export function paginatedJson<T>(data: T[], total: number, params: PaginationParams): NextResponse {
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  return NextResponse.json(data, {
    headers: {
      "X-Total-Count": String(total),
      "X-Page": String(params.page),
      "X-Page-Limit": String(params.limit),
      "X-Total-Pages": String(totalPages),
    },
  });
}

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

/**
 * Extract the client IP.
 *
 * We only honour `x-forwarded-for` / `x-real-ip` when the deployment is
 * explicitly behind a trusted reverse proxy (via `TRUSTED_PROXY=true`),
 * otherwise clients could forge the header to bypass rate limiting.
 *
 * When trusted, we take the RIGHTMOST IP in `x-forwarded-for` because that is
 * the address our proxy saw; entries to the left are attacker-controlled.
 */
export function getClientIp(req: NextRequest): string {
  const trustProxy = process.env.TRUSTED_PROXY === "true";

  if (trustProxy) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) {
      return realIp;
    }
  }

  // When TRUSTED_PROXY is not enabled, ignore spoofable forwarding headers.
  return (req as { ip?: string }).ip ?? "direct";
}

function getRateLimitKey(req: NextRequest): string {
  const clientIp = getClientIp(req);
  if (clientIp !== "direct") return clientIp;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const hash = crypto.createHash("sha256").update(authHeader).digest("hex").slice(0, 16);
    return `pat:${hash}`;
  }
  const sessionCookie =
    req.cookies?.get("__Secure-next-auth.session-token")?.value ??
    req.cookies?.get("next-auth.session-token")?.value;
  if (sessionCookie) {
    const hash = crypto.createHash("sha256").update(sessionCookie).digest("hex").slice(0, 16);
    return `sess:${hash}`;
  }
  return "direct";
}

// ---------------------------------------------------------------------------
// API handler wrapper
// ---------------------------------------------------------------------------

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
      ...(message ? { details: message } : {}),
    },
    { status: 503 },
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
    },
  );

export function withApiHandler<TContext = Record<string, unknown>>(
  handler: RouteHandler<TContext>,
  options: ApiHandlerOptions = {},
): RouteHandlerReturn<TContext> {
  return async (req, context) => {
    // Rate limiting (can be disabled per-endpoint)
    if (!options.skipRateLimit) {
      const rateLimitKey = getRateLimitKey(req);
      const rateLimitResult = await defaultRateLimiter.checkAsync(rateLimitKey);

      if (!rateLimitResult.success) {
        apiLogger.warn({ rateLimitKey }, "Rate limit exceeded");
        return rateLimitExceeded(rateLimitResult);
      }
    }

    try {
      return await handler(req, context);
    } catch (error) {
      apiLogger.error(
        { method: req.method, path: req.nextUrl.pathname, err: error },
        "Request failed",
      );

      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid request payload", issues: error.issues },
          { status: 400 },
        );
      }

      const isProd = process.env.NODE_ENV === "production";

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return NextResponse.json(
            { error: "Unique constraint violation", target: isProd ? undefined : error.meta?.target },
            { status: 409 },
          );
        }

        if (error.code === "P2003") {
          return NextResponse.json(
            { error: "Invalid reference", message: "The operation references a record that does not exist." },
            { status: 400 },
          );
        }

        if (error.code === "P2025") {
          return NextResponse.json(
            { error: "Resource not found" },
            { status: 404 },
          );
        }

        return NextResponse.json(
          { error: "Database request failed", code: isProd ? undefined : error.code },
          { status: 500 },
        );
      }

      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientRustPanicError
      ) {
        return databaseUnavailable(isProd ? undefined : error.message);
      }

      if (error instanceof Prisma.PrismaClientValidationError) {
        return NextResponse.json(
          { error: "Invalid database query", message: isProd ? undefined : error.message },
          { status: 400 },
        );
      }

      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        return NextResponse.json(
          { error: "Database request failed", message: isProd ? undefined : error.message },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
