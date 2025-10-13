import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

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

export const parseCsv = (content: string): CsvRow[] => {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  }) as CsvRow[];
};

export const exportCsv = (rows: CsvRow[]) => {
  return stringify(rows, {
    header: true,
    columns: csvHeaders
  });
};
