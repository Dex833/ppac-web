import React from "react";

export default function RequirementsMembership() {
  return (
    <div className="max-w-2xl mx-auto p-6">
  <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Membership Requirements & Types (PPAC)</h1>
  <div className="text-justify text-base sm:text-lg leading-relaxed">
        <h2>Overview</h2>
        <p>PPAC welcomes four member types: <b>Farmer</b>, <b>Consumer</b>, <b>Associate</b>, and <b>Establishment/Institution</b> (Puerto Princesa–based).</p>
        <ul>
          <li>All applicants must be of legal age and able to provide valid proof of residency.</li>
          <li>One-time membership fee: ₱300.</li>
          <li>Standard subscribed share capital: ₱4,000 (see per-type notes below).</li>
          <li>Maximum share capital per member: ₱16,000.</li>
        </ul>

        <h2>Member Types & Eligibility</h2>
        <b>A. Farmer Member (primary/core)</b>
        <ul>
          <li>Must have a farm within Puerto Princesa City.</li>
          <li>Must present certification from the City Agriculture Office.</li>
          <li>This group is carefully screened; main officers (e.g., Board of Directors, Chairperson, Vice Chair) will be drawn from Farmer Members.</li>
        </ul>
        <b>B. Consumer Member</b>
        <ul>
          <li>Must be a resident of Puerto Princesa City.</li>
        </ul>
        <b>C. Associate Member</b>
        <ul>
          <li>For applicants from outside Puerto Princesa who wish to join.</li>
        </ul>
        <b>D. Establishment / Institution Member</b>
        <ul>
          <li>Puerto Princesa–based establishments or institutions.</li>
        </ul>

        <h2>General Requirements (all types)</h2>
        <ul>
          <li>Legal age.</li>
          <li>Valid proof of residency (city address for Farmer/Consumer/Establishment; home locality for Associate).</li>
          <li>Government ID(s) as applicable.</li>
          <li>Paid membership fee: ₱300.</li>
          <li>Subscribed share capital: ₱4,000 (see capital/payment terms below).</li>
        </ul>

        <h2>Capital & Payment Terms</h2>
        <ul>
          <li>Standard subscribed capital: ₱4,000.</li>
          <li>Associate Member special terms:
            <ul>
              <li>Paid-up capital at joining: ₱2,000</li>
              <li>Remaining ₱2,000 payable within 3 months</li>
            </ul>
          </li>
          <li>Maximum share capital for any member: ₱16,000.</li>
        </ul>

        <h2>Rights & Benefits (by type)</h2>
        <b>A. Farmer Member</b>
        <ul>
          <li>Full member benefits.</li>
          <li>Eligible to be elected as officers: Board of Directors, Chairperson, Vice Chair (officers are sourced from Farmer Members).</li>
        </ul>
        <b>B. Consumer Member</b>
        <ul>
          <li>Receives all member benefits.</li>
          <li>Not eligible to be elected as BOD/Chairperson.</li>
          <li>Can be appointed to roles such as Treasurer, General Manager, Secretary, Auditor, etc.</li>
        </ul>
        <b>C. Associate Member</b>
        <ul>
          <li>No voting rights.</li>
          <li>Receives member benefits such as “balik-tangkilik” and member discounts.</li>
          <li>Capital terms as stated (₱2,000 paid-up; ₱2,000 within 3 months).</li>
        </ul>
        <b>D. Establishment / Institution Member</b>
        <ul>
          <li>Puerto Princesa–based; enjoys member benefits aligned with coop programs.</li>
          <li>(Voting/eligibility per bylaws—mirror Consumer rules if that’s your policy.)</li>
        </ul>

        <h2>Core Member Benefits (applies where eligible)</h2>
        <ul>
          <li>Access to PPAC programs and services (trading nights, rice stall participation/benefits, etc.).</li>
          <li>Transparent, online accounting view (share capital, loans, transactions).</li>
          <li>Realtime cooperative reports (as in REAL time): transact now, see reports update instantly.</li>
          <li>Community, training, and market linkage for local produce.</li>
          <li>Patronage/discounts where applicable.</li>
        </ul>

        <h2>Screening & Approval</h2>
        <ul>
          <li>Farmer Members undergo thorough vetting (farm verification + City Agriculture certification).</li>
          <li>Consumer, Associate, Establishment: document check and residency validation.</li>
          <li>Applications are reviewed per PPAC policy and bylaws.</li>
        </ul>

        <h2>How to Apply (Simple Flow)</h2>
        <ul>
          <li>Choose your member type (Farmer, Consumer, Associate, Establishment).</li>
          <li>Prepare required documents (ID, proof of residency, plus City Agri certification for Farmers).</li>
          <li>Pay membership fee (₱300) and initial paid-up capital (per type).</li>
          <li>Submit application (online or on-site); await verification.</li>
          <li>Upon approval, receive onboarding details and website access for your account.</li>
        </ul>

        <h2>Important Notes</h2>
        <ul>
          <li>Officer positions are sourced from Farmer Members.</li>
          <li>Consumer Members may hold appointed (non-elected) positions.</li>
          <li>Associate Members have no voting rights but enjoy key economic benefits.</li>
          <li>All capital and fee policies follow PPAC bylaws and may be updated by the Board.</li>
        </ul>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
        <a className="btn btn-primary w-full sm:w-auto text-lg" href="/Signup">Sign Up</a>
      </div>
    </div>
  );
}
