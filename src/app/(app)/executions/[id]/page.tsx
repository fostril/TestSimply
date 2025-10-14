import { ManualRunner } from "@/components/runner/manual-runner";

export default function ExecutionDetailPage({ params }: { params: { id: string } }) {
  return <ManualRunner executionId={params.id} />;
}
