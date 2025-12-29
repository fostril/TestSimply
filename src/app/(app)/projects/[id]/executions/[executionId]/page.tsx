import { ManualRunner } from "@/components/runner/manual-runner";

export default function ExecutionDetailPage({ params }: { params: { id: string, executionId: string } }) {
  return <ManualRunner executionId={params.executionId} projectKey={params.id} />;
}
