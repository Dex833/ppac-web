import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#4ade80", "#f87171", "#60a5fa", "#fbbf24", "#a78bfa", "#34d399", "#f472b6", "#facc15"];

export default function IncomeStatementChart({ revenues, expenses }) {
  const data = [
    ...revenues.map(r => ({ name: r.name, value: Math.abs(r.amount), type: "Revenue" })),
    ...expenses.map(e => ({ name: e.name, value: Math.abs(e.amount), type: "Expense" })),
  ];
  return (
    <div className="mb-6">
      <h4 className="font-semibold mb-2">Revenues vs Expenses</h4>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label
          >
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={v => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
