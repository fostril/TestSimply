"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { Upload, FileText, AlertCircle, CheckCircle, X } from "lucide-react";

interface CsvImporterProps {
    projectId: string;
    onSuccess?: () => void;
}

export function CsvImporter({ projectId, onSuccess }: CsvImporterProps) {
    const toast = useToast();
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<{ count: number; errors: string[]; total: number } | null>(null);

    const importMutation = useMutation({
        mutationFn: async (csvData: string) => {
            const res = await fetch("/api/imports/csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, csvData }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to import CSV");
            }

            return res.json();
        },
        onSuccess: (data) => {
            setImportResult(data);
            queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
            if (onSuccess) onSuccess();
            toast({
                title: "Import complete",
                description: `Imported ${data.count} of ${data.total} cases.`,
            });
        },
        onError: (err) => {
            toast({
                title: "Import failed",
                description: (err as Error).message,
            });
        },
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setFileContent(content);
            setImportResult(null);
        };
        reader.readAsText(file);
    };

    const handleImport = () => {
        if (fileContent) {
            importMutation.mutate(fileContent);
        }
    };

    const reset = () => {
        setFileName(null);
        setFileContent(null);
        setImportResult(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
                <Upload className="h-4 w-4" />
                Import CSV
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Import Test Cases</h2>
                    <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-700">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {!importResult ? (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Upload a CSV file. Export from TestSimply uses columns{" "}
                            <code className="rounded bg-slate-100 px-1 text-slate-800">name</code>,{" "}
                            <code className="rounded bg-slate-100 px-1 text-slate-800">description</code>,{" "}
                            <code className="rounded bg-slate-100 px-1 text-slate-800">precondition</code>,{" "}
                            <code className="rounded bg-slate-100 px-1 text-slate-800">steps.action</code>,{" "}
                            <code className="rounded bg-slate-100 px-1 text-slate-800">steps.expected</code>,{" "}
                            <code className="rounded bg-slate-100 px-1 text-slate-800">expected_result</code>,
                            and <code className="rounded bg-slate-100 px-1 text-slate-800">tags</code>.{" "}
                            <code className="rounded bg-slate-100 px-1 text-slate-800">title</code> is also accepted.
                        </p>

                        <div
                            className={`relative flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors ${
                                fileName ? "border-blue-500 bg-blue-50/50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="absolute inset-0 cursor-pointer opacity-0"
                            />
                            {fileName ? (
                                <div className="flex flex-col items-center gap-2 text-center">
                                    <FileText className="h-8 w-8 text-blue-600" />
                                    <span className="text-sm font-medium text-slate-900">{fileName}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            reset();
                                        }}
                                        className="text-xs text-slate-500 hover:text-red-600"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-center">
                                    <Upload className="h-8 w-8 text-slate-400" />
                                    <span className="text-sm font-medium text-slate-700">Click to upload CSV</span>
                                    <span className="text-xs text-slate-500">or drag and drop</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={!fileContent || importMutation.isPending}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {importMutation.isPending ? "Importing..." : "Import Cases"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 py-4">
                            {importResult.errors.length === 0 ? (
                                <div className="rounded-full bg-emerald-50 p-3">
                                    <CheckCircle className="h-8 w-8 text-emerald-600" />
                                </div>
                            ) : (
                                <div className="rounded-full bg-amber-50 p-3">
                                    <AlertCircle className="h-8 w-8 text-amber-600" />
                                </div>
                            )}
                            <div className="text-center">
                                <h3 className="text-lg font-medium text-slate-900">
                                    {importResult.count} cases imported
                                </h3>
                                <p className="text-sm text-slate-600">
                                    out of {importResult.total} rows processed
                                </p>
                            </div>
                        </div>

                        {importResult.errors.length > 0 && (
                            <div className="rounded-md border border-red-200 bg-red-50 p-4">
                                <h4 className="mb-2 text-sm font-medium text-red-700">Errors ({importResult.errors.length})</h4>
                                <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                                    {importResult.errors.map((err, i) => (
                                        <div key={i}>{err}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    reset();
                                    setIsOpen(false);
                                }}
                                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
