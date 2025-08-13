import React from "react";
import { Outlet } from "react-router-dom";
import AccountingNav from "./AccountingNav";
import PageBackground from "../../components/PageBackground";
const accountingBg = "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

export default function Accounting() {
  return (
    <PageBackground image={accountingBg} boxed boxedWidth="max-w-7xl" overlayClass="bg-white/85 backdrop-blur" className="page-gutter">
      <h2 className="text-2xl font-bold mb-4">Accounting</h2>
      <AccountingNav />
      <Outlet />
    </PageBackground>
  );
}
