type FieldError = { type: string; message?: string };
type FieldErrors<TFieldValues> = Record<string, unknown> & TFieldValues;

type Resolver<TFieldValues> = (
  values: unknown
) => Promise<{ values: TFieldValues | {}; errors: FieldErrors<TFieldValues> }>;

type Issue = { path: (string | number)[]; code: string; message: string };

type ZodLikeResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: Issue[] } };

type ZodLikeSchema<T> = {
  safeParseAsync(values: unknown): Promise<ZodLikeResult<T>>;
};

function assignFieldError(
  target: Record<string, unknown>,
  path: (string | number)[],
  error: FieldError
) {
  let cursor: Record<string, unknown> = target;

  path.forEach((segment, index) => {
    const key = String(segment);
    const isLast = index === path.length - 1;

    if (isLast) {
      const existing = cursor[key];
      cursor[key] = typeof existing === "object" && existing !== null
        ? { ...existing, ...error }
        : error;
      return;
    }

    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }

    cursor = cursor[key] as Record<string, unknown>;
  });
}

function mapZodErrors<TFieldValues>(
  zodError: { issues: Issue[] }
): FieldErrors<TFieldValues> {
  const fieldErrors: Record<string, unknown> = {};

  for (const issue of zodError.issues) {
    const path = issue.path.length ? issue.path : ["root"];
    assignFieldError(fieldErrors, path, {
      type: issue.code,
      message: issue.message
    });
  }

  return fieldErrors as FieldErrors<TFieldValues>;
}

export function zodResolver<TSchema>(schema: ZodLikeSchema<TSchema>): Resolver<TSchema> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);

    if (result.success) {
      return {
        values: result.data,
        errors: {}
      };
    }

    return {
      values: {},
      errors: mapZodErrors(result.error)
    };
  };
}
