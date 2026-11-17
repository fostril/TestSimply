"use client";

import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
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
    },
  });

  return (
    <div className="mt-4 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data ?? []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: "#cbd5e1" }}
            contentStyle={{
              backgroundColor: "#ffffff",
              borderColor: "#e2e8f0",
              borderRadius: 6,
              color: "#0f172a",
              fontSize: 12,
            }}
          />
          <Area type="monotone" dataKey="pass" stroke="#16a34a" fill="#dcfce7" fillOpacity={0.8} />
          <Area type="monotone" dataKey="fail" stroke="#dc2626" fill="#fee2e2" fillOpacity={0.8} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
