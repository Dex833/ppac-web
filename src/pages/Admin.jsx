import React from "react";

export default function Admin() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="card p-8">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Admin</h2>
        <p className="text-slate-600">
          Only users with the <span className="badge">admin</span> role can see this page.
        </p>
      </div>
    </div>
  );
}
