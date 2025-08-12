// src/pages/BecomeMember.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function BecomeMember() {
  return (
    <div className="max-w-2xl mx-auto card p-8 my-8">
      <h1 className="text-3xl font-bold mb-4 text-brand-700">Become a Member</h1>
      <p className="mb-4 text-lg text-ink/80">
        Joining a cooperative is more than just opening an account—it's joining a community that values mutual help, shared prosperity, and democratic decision-making. As a member, you:
      </p>
      <ul className="list-disc list-inside mb-6 text-ink/80">
        <li>Own a share of the cooperative and have a voice in its direction</li>
        <li>Benefit from shared profits and lower service costs</li>
        <li>Access financial services, training, and support</li>
        <li>Help strengthen the local economy and community</li>
        <li>Support sustainable agriculture and responsible business</li>
      </ul>
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Why Join Us?</h2>
        <p className="mb-2">Our cooperative is dedicated to empowering members, providing fair opportunities, and building a better future together. Whether you're a farmer, entrepreneur, or community member, your participation makes a difference!</p>
        <p>Experience the power of cooperation—become a member today!</p>
      </div>
      <div className="flex justify-center mt-8">
        <Link to="/signup" className="btn btn-primary text-lg px-8 py-3">Sign Up Now</Link>
      </div>
    </div>
  );
}
