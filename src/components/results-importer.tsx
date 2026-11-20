"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

type EnvironmentOption = {
  id: string;
  name: string;
};

type ResultsImporterProps = {
  projectId: string | null;
  projectKey: string | null;
  defaultExecKey?: string;
  onSuccess?: (result: { imported: number; execKey: string }) => void;
  buttonLabel?: string;
  buttonClassName?: string;
};

export function ResultsImporter({
  projectId,
  projectKey,
  defaultExecKey = "",
  onSuccess,
  buttonLabel = "Import Results",
  buttonClassName,
}: ResultsImporterProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<"junit" | "cucumber">("junit");
  const [file, setFile] = useState<File | null>(null);
  const [execKey, setExecKey] = useState(defaultExecKey);
  const [environment, setEnvironment] = useState("");
  const [autoCreateCases, setAutoCreateCases] = useState(true);
  const [createExecutionIfMissing, setCreateExecutionIfMissing] = useState(!defaultExecKey);

  const { data: environments } = useQuery<EnvironmentOption[]>({
    queryKey: ["environments", projectId],
    enabled: isOpen && Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/environments?projectId=${projectId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const resetForm = () => {
    setFormat("junit");
    setFile(null);
    setExecKey(defaultExecKey);
    setEnvironment("");
    setAutoCreateCases(true);
    setCreateExecutionIfMissing(!defaultExecKey);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!projectKey) throw new Error("Select a project first");
      if (!file) throw new Error("Choose a report file to upload");

      const params = new URLSearchParams({
        projectKey,
        autoCreateCases: String(autoCreateCases),
        createExecutionIfMissing: String(createExecutionIfMissing),
      });
      if (execKey.trim()) params.set("execKey", execKey.trim());
      if (environment.trim()) params.set("environment", environment.trim());

      let res: Response;
      if (format === "junit") {
        const formData = new FormData();
        formData.append("report", file);
        res = await fetch(`/api/import/junit?${params.toString()}`, {
          method: "POST",
          body: formData,
        });
      } else {
        const rawText = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          throw new Error("Invalid JSON in Cucumber report file");
        }
        if (!Array.isArray(parsed)) {
          throw new Error("Cucumber JSON report must be an array of features");
        }
        res = await fetch(`/api/import/cucumber?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to import test results");
      }
      return data as { imported: number; execKey: string; unmapped?: string[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["executions", projectId] });
      queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
      if (defaultExecKey) {
        queryClient.invalidateQueries({ queryKey: ["execution", defaultExecKey] });
      }
      if (data.execKey) {
        queryClient.invalidateQueries({ queryKey: ["execution", data.execKey] });
      }
      const unmappedCount = data.unmapped?.length ?? 0;
      toast({
        title: `Imported ${data.imported} test result${data.imported === 1 ? "" : "s"}`,
        description:
          unmappedCount > 0
            ? `Execution ${data.execKey} (${unmappedCount} unmapped case${unmappedCount === 1 ? "" : "s"} skipped)`
            : `Updated execution ${data.execKey}`,
      });
      onSuccess?.({ imported: data.imported, execKey: data.execKey });
      setIsOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      toast({
        title: "Import failed",
        description: (err as Error).message,
      });
    },
  });

  return (
    <>
      <button
        type="button"
        disabled={!projectKey}
        onClick={() => {
          resetForm();
          setIsOpen(true);
        }}
        className={
          buttonClassName ||
          "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        }
      >
        <Upload className="h-4 w-4" />
        {buttonLabel}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Import Test Results</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Upload a JUnit XML or Cucumber JSON report to record results into an execution.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close import modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                importMutation.mutate();
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Report Format
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormat("junit");
                      setFile(null);
                    }}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      format === "junit"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    JUnit XML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormat("cucumber");
                      setFile(null);
                    }}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      format === "cucumber"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Cucumber JSON
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Report File
                </label>
                <input
                  type="file"
                  accept={format === "junit" ? ".xml,.junit,text/xml,application/xml" : ".json,application/json"}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Execution Key (optional)
                  </label>
                  <input
                    type="text"
                    value={execKey}
                    onChange={(e) => setExecKey(e.target.value)}
                    placeholder={defaultExecKey || `${projectKey || "EXEC"}-EXEC-...`}
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Environment (optional)
                  </label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  >
                    <option value="">None / Default</option>
                    {(environments ?? []).map((env) => (
                      <option key={env.id} value={env.name}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoCreateCases}
                    onChange={(e) => setAutoCreateCases(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  Auto-create missing test cases
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createExecutionIfMissing}
                    onChange={(e) => setCreateExecutionIfMissing(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  Create execution if missing
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importMutation.isPending || !file}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {importMutation.isPending ? "Importing..." : "Import Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
