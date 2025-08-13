import React from "react";

export default function RequirementsMembership() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Membership Requirements</h1>
      <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80" alt="Membership Requirements" className="rounded-xl mb-4 w-full h-64 object-cover" />
      <p className="mb-4 text-lg">To become a member, please prepare the following requirements:</p>
      <ul className="list-disc pl-6 mb-4">
        <li>Completed membership application form</li>
        <li>Valid government-issued ID</li>
        <li>Proof of address</li>
        <li>Initial share capital contribution</li>
      </ul>
      <p className="text-ink/70">Submit your documents at our office or upload them online through your profile page.</p>
    </div>
  );
}
