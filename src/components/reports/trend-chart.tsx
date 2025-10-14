"use client";

import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis } from "recharts";
import { useProjectStore } from "@/lib/stores/project-store";

type TrendPoint = { date: string; pass: number; fail: number };

export function TrendChart() {
  const projectId = useProjectStore((state) => state.projectId);
  const { data } = useQuery<TrendPoint[]>({
    queryKey: ["trend", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/trend${projectId ? `?projectId=${projectId}` : ""}`);
      if (!res.ok) throw new Error("Failed to load trend");
      return res.json();
    }
  });

  return (
    <div className="mt-4 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data ?? []}>
          <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ stroke: "#334155" }} contentStyle={{ backgroundColor: "#0f172a", borderRadius: 12 }} />
          <Area type="monotone" dataKey="pass" stackId="1" stroke="#22c55e" fill="#14532d" />
          <Area type="monotone" dataKey="fail" stackId="1" stroke="#ef4444" fill="#7f1d1d" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
