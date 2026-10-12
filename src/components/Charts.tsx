"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];
const fmt = (v: unknown) => `₹${Number(v).toLocaleString("en-IN")}`;
const short = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

export function CollectionChart({ data }: { data: { month: string; expected: number; collected: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="month" tickFormatter={short} fontSize={11} />
        <YAxis fontSize={11} width={48} tickFormatter={(v) => `${v / 1000}k`} />
        <Tooltip formatter={fmt} labelFormatter={(m) => String(m)} />
        <Legend />
        <Bar dataKey="expected" name="Expected" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
        <Bar dataKey="collected" name="Collected" fill="#4f46e5" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExpenseDonut({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <p className="py-16 text-center text-sm text-muted">No expenses this month</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={fmt} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data }: { data: { month: string; received: number; expenses: number; net: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="month" tickFormatter={short} fontSize={11} />
        <YAxis fontSize={11} width={48} tickFormatter={(v) => `${v / 1000}k`} />
        <Tooltip formatter={fmt} />
        <Legend />
        <Line dataKey="received" name="Income" stroke="#10b981" strokeWidth={2} dot={false} />
        <Line dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
        <Line dataKey="net" name="Net" stroke="#4f46e5" strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
