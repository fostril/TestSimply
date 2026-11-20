export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export const DEFAULT_PAGE_LIMIT = 50;

export async function fetchPaginated<T>(
  url: string,
  fallbackError = "Failed to load data"
): Promise<PaginatedResult<T>> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || fallbackError);
  }
  const items = (await res.json()) as T[];
  const total = Number(res.headers.get("X-Total-Count") ?? items.length);
  const page = Number(res.headers.get("X-Page") ?? 1);
  const limit = Number(res.headers.get("X-Page-Limit") ?? DEFAULT_PAGE_LIMIT);
  const totalPages = Math.max(1, Number(res.headers.get("X-Total-Pages") ?? 1));
  return { items, total, page, limit, totalPages };
}
