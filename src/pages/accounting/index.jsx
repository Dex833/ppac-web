import React from "react";
import { Outlet } from "react-router-dom";
import AccountingNav from "./AccountingNav";

export default function Accounting() {
  return (
    <div className="card p-6">
      <h2 className="text-3xl font-bold mb-4">Accounting</h2>
      <AccountingNav />
      <Outlet />
    </div>
  );
}
