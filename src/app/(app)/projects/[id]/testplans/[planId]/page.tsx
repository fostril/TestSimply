"use client";

import { TestPlanDetailsPage } from "@/components/pages/test-plan-details-page";

export default function Page({ params }: { params: { planId: string } }) {
    return <TestPlanDetailsPage id={params.planId} />;
}
