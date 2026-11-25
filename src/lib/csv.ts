export const csvHeaders = [
  "name",
  "description",
  "precondition",
  "steps.action",
  "steps.expected",
  "expected_result",
  "tags"
];

export type CsvRow = {
  name: string;
  description?: string;
  precondition?: string;
  "steps.action"?: string;
  "steps.expected"?: string;
  expected_result?: string;
  tags?: string;
};

const parseCsvRecords = (content: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && content[i + 1] === "\n") {
        i += 1;
      }
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
};

export const parseCsv = (content: string): CsvRow[] => {
  const records = parseCsvRecords(content);
  if (records.length === 0) {
    return [];
  }

  const headers = records[0];
  return records.slice(1).map((values) => {
    return headers.reduce((acc, header, index) => {
      const key = header as keyof CsvRow;
      acc[key] = values[index] ?? "";
      return acc;
    }, {} as CsvRow);
  });
};

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * Neutralize spreadsheet formula / DDE prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`)
 * by prepending a single quote (`'`).
 */
export const sanitizeCsvCell = (value: string | undefined | null): string => {
  if (value == null) return "";
  const str = String(value);
  return FORMULA_TRIGGERS.test(str) ? `'${str}` : str;
};

export const escapeCsvCell = (value: string | undefined | null): string => {
  const safe = sanitizeCsvCell(value);
  if (safe.includes(",") || safe.includes("\n") || safe.includes("\r") || safe.includes('"')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
};

export const exportCsv = (rows: CsvRow[]) => {
  const headerLine = csvHeaders.join(",");
  const valueLines = rows.map((row) =>
    csvHeaders.map((header) => escapeCsvCell(row[header as keyof CsvRow])).join(","),
  );
  return [headerLine, ...valueLines].join("\n");
};
