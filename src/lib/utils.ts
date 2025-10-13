export type ClassValue = string | number | null | undefined | ClassValue[] | Record<string, boolean>;

const flatten = (value: ClassValue): string[] => {
  if (!value) return [];
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flatten);
  }
  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key);
};

export function cn(...inputs: ClassValue[]) {
  const classes = new Set<string>();
  inputs.flatMap(flatten).forEach((className) => {
    className
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token) => classes.add(token));
  });
  return Array.from(classes).join(" ");
}
