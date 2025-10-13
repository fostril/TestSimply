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

const splitCsvLine = (line: string) => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

export const parseCsv = (content: string): CsvRow[] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((acc, header, index) => {
      const key = header as keyof CsvRow;
      acc[key] = values[index] ?? "";
      return acc;
    }, {} as CsvRow);
  });
};

const escapeValue = (value: string | undefined) => {
  if (value == null) return "";
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const exportCsv = (rows: CsvRow[]) => {
  const headerLine = csvHeaders.join(",");
  const valueLines = rows.map((row) => csvHeaders.map((header) => escapeValue(row[header as keyof CsvRow])).join(","));
  return [headerLine, ...valueLines].join("\n");
};
