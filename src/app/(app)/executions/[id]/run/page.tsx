import { ManualRunner } from "@/components/runner/manual-runner";

export default function Page({ params }: { params: { id: string } }) {
  return <ManualRunner executionId={params.id} />;
}
