import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  testCase: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  projectCounter: {
    upsert: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { POST as importCsvJson } from "@/app/api/imports/csv/route";
import { POST as importCsvFile } from "@/app/api/testcases/import/route";
import { GET as exportCsvRoute } from "@/app/api/testcases/export/route";

describe("CSV import & export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-lead", name: "Liam", email: "liam@test.local", role: Role.LEAD },
    });
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    let seq = 0;
    mockPrisma.projectCounter.upsert.mockImplementation(async () => ({ count: ++seq }));
    mockPrisma.testCase.create.mockImplementation(async ({ data }: any) => ({
      id: `tc-${seq}`,
      ...data,
    }));
  });

  it("imports CSV template rows via /api/imports/csv", async () => {
    const csvData = [
      "name,description,precondition,steps.action,steps.expected,expected_result,tags",
      '"Login Test","Validates login","User exists","Open page | Enter creds","Page loads | Logged in","Dashboard","smoke,auth"',
    ].join("\n");

    const req = new NextRequest("http://localhost:3000/api/imports/csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", csvData }),
    });

    const res = await importCsvJson(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.errors).toEqual([]);
    expect(mockPrisma.testCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Login Test",
          tags: ["smoke", "auth"],
          steps: [
            { action: "Open page", expected: "Page loads" },
            { action: "Enter creds", expected: "Logged in" },
          ],
        }),
      }),
    );
  });

  it("reports row error when name/title is missing", async () => {
    const csvData = [
      "name,description",
      ",Missing name row",
      "Valid Case,Has name",
    ].join("\n");

    const req = new NextRequest("http://localhost:3000/api/imports/csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", csvData }),
    });

    const res = await importCsvJson(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toContain("Row 1");
  });

  it("returns 400 on malformed CSV parse error", async () => {
    const csvData = 'name,description\n"unterminated quote,bad';
    const req = new NextRequest("http://localhost:3000/api/imports/csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", csvData }),
    });

    const res = await importCsvJson(req, {});
    expect(res.status).toBe(400);
  });

  it("round-trips test cases through export -> import", async () => {
    const storedCases = [
      {
        id: "tc-1",
        projectId: "proj-1",
        key: "ALPHA_TC_1",
        name: "Checkout Flow",
        description: "Verify checkout",
        preconditionsText: "Cart has item",
        steps: [
          { action: "Click checkout", expected: "Payment shown" },
          { action: "Pay", expected: "Receipt shown" },
        ],
        expected: "Order placed",
        tags: ["e2e", "payments"],
      },
    ];
    mockPrisma.testCase.findMany.mockResolvedValue(storedCases);

    const exportReq = new NextRequest("http://localhost:3000/api/testcases/export?projectId=proj-1");
    const exportRes = await exportCsvRoute(exportReq, {});
    expect(exportRes.status).toBe(200);
    const exportedCsv = await exportRes.text();

    const form = new FormData();
    form.append("projectId", "proj-1");
    form.append("file", new Blob([exportedCsv], { type: "text/plain" }), "testcases.csv");
    const importReq = new NextRequest("http://localhost:3000/api/testcases/import", {
      method: "POST",
      body: form,
    });
    const importRes = await importCsvFile(importReq, {});
    expect(importRes.status).toBe(201);
    const created = await importRes.json();
    expect(created).toHaveLength(1);
    expect(created[0].name).toBe("Checkout Flow");
    expect(created[0].steps).toEqual(storedCases[0].steps);
    expect(created[0].tags).toEqual(["e2e", "payments"]);
  });

  it("neutralizes spreadsheet formula prefixes (=, +, -, @) on CSV export", async () => {
    mockPrisma.testCase.findMany.mockResolvedValue([
      {
        id: "tc-formula",
        projectId: "proj-1",
        key: "ALPHA_TC_9",
        name: "=1+1",
        description: "+SUM(A1:A2)",
        preconditionsText: "-2+3",
        steps: [{ action: "@import", expected: "Safe" }],
        expected: "\tTabbed",
        tags: ["sec"],
      },
    ]);

    const exportReq = new NextRequest("http://localhost:3000/api/testcases/export?projectId=proj-1");
    const exportRes = await exportCsvRoute(exportReq, {});
    expect(exportRes.status).toBe(200);
    const exportedCsv = await exportRes.text();
    const dataLine = exportedCsv.split("\n")[1];
    expect(dataLine).toContain("'=1+1");
    expect(dataLine).toContain("'+SUM(A1:A2)");
    expect(dataLine).toContain("'-2+3");
    expect(dataLine).toContain("'@import");
  });
});
