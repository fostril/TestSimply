"use client";

import { TestSetDetailsPage } from "@/components/pages/test-set-details-page";

export default function Page({ params }: { params: { id: string, setId: string } }) {
    return <TestSetDetailsPage id={params.setId} projectKey={params.id} />;
}
