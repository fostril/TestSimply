import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  projectSetting: {
    upsert: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { PATCH as updateSettings } from "@/app/api/projects/settings/route";

describe("Project settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.projectSetting.upsert.mockImplementation(async ({ create }: any) => ({
      id: "set-1",
      ...create,
    }));
  });

  it("forbids TESTER from updating project settings (403)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-tester", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });

    const req = new NextRequest("http://localhost:3000/api/projects/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", jiraProjectKey: "AL" }),
    });
    const res = await updateSettings(req, {});
    expect(res.status).toBe(403);
  });

  it("resolves project by key and does not overwrite masked secrets", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-lead", name: "Liam", email: "liam@test.local", role: Role.LEAD },
    });

    const req = new NextRequest("http://localhost:3000/api/projects/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "ALPHA",
        jiraUrl: "https://example.atlassian.net",
        jiraApiToken: "********",
        ciToken: "********",
      }),
    });
    const res = await updateSettings(req, {});
    expect(res.status).toBe(200);

    const call = mockPrisma.projectSetting.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ projectId: "proj-1" });
    expect(call.update).not.toHaveProperty("jiraApiToken");
    expect(call.update).not.toHaveProperty("ciToken");
    expect(call.update.jiraUrl).toBe("https://example.atlassian.net");
  });
});
