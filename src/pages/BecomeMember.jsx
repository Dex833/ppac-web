
import React from "react";
import Html from "../components/Html";

const hero = "https://images.unsplash.com/photo-1542834369-f10ebf06d3cb?auto=format&fit=crop&w=1600&q=80";
const body = `
<section>
  <h1 style="font-size:2.25rem; font-weight:700; margin-bottom:1.5rem; text-align:center;">Be a Founding Member — The Best Time to Join Is Now.</h1>
  <div style="text-align:justify; font-size:1.1rem; line-height:1.7;">
    <p>We’re a new cooperative with a big mission for Puerto Princesa City. Join today and be counted as a founding member—help shape our system, our services, and our story. <i>Kung hindi tayo, sino? Kung hindi ngayon, kailan?</i></p>

    <p><b>1) New coop, new power — founder ka.</b><br/>
    Unahan na! Kapag sumali ka ngayon, kasama ka sa pagbubuo ng policies, priorities, at mga proyektong uunahin. May boses ka—mula trading nights hanggang pricing and programs.</p>

    <p><b>2) Limited ang pondo, pero hindi limitado ang utak.</b><br/>
    Wala kaming malaking pondo, pero malakas ang isip at sipag ng mga tao. Ang website na ‘to—kasama ang financial bookkeeping &amp; accounting system—ay gawa ng ating sariling kamay at talino. <b>Transparent.</b> Makikita mo ang share capital, loans, at transactions mo online. Walang tago, walang duda.</p>

    <p><b>3) Bago sa papel, hindi bago sa laban.</b><br/>
    Cooperative tayo ngayon, pero mahigit isang dekada na tayong nagtratrabaho bilang asosasyon. Parehong tao, parehong puso—mas malakas lang ngayon dahil legal na coop na tayo, mas maraming pwedeng maabot.</p>

    <p><b>4) Walang utang sa bangko—sa miyembro kami kumakapit.</b><br/>
    Hindi kami kumuha ng loan. Pinili naming umasa sa inyo—sa ating mga miyembro—para sabay-sabay tayong magtayo. Kapag nag-ambag ka ng share capital, hindi lang perang pumasok ‘yan—tiwala at direksyon ang pinapasok mo.</p>

    <p><b>5) Realtime cooperative reports</b> — as in REAL time; kapag may transaction, agad mong makikita ang pagbabago sa dashboards at reports (share capital, loans, sales, balances)</p>

    <h2 style="font-size:1.3rem; font-weight:600; margin-top:2rem;">Ano ang makukuha mo bilang miyembro?</h2>
    <ul style="margin-bottom:1.5rem;">
      <li>Boses at boto sa direksyon ng coop (founding influence)</li>
      <li>Transparent online account (share capital, loans, history)</li>
      <li>Priority access sa trading nights (Tue &amp; Fri) at programs</li>
      <li>Fair pricing and market linkage para sa farmers &amp; partners</li>
      <li>Community &amp; training—tulungan, hindi pabigatan</li>
      <li>Potential patronage/refunds/dividends (ayon sa batas at performance)</li>
    </ul>

    <p><b>Tuloy-tuloy ang galaw:</b><br/>
    Malakas ang benta sa Agri Trading Center tuwing Tuesday &amp; Friday night. Lumalakas araw-araw ang customers sa rice stall. Umaandar ang CDA papers. Tumatanggap tayo ng New Members ngayon—farmers, consumers, marketers, establishments. Lahat may puwang.</p>

    <p style="margin-top:2rem; font-weight:600;">Sumali ka na ngayon.<br/>Ito ang simula na ikaw ang kasama sa bawat page ng kwento. Be a founding member of PPAC.</p>
  </div>
  <div style="display:flex; gap:1rem; justify-content:center; margin-top:2rem;">
    <a class="btn btn-primary" href="/RequirementsMembership">See Requirements</a>
    <a class="btn btn-outline" href="/Signup">Sign Up</a>
  </div>
</section>
`;

export default function BecomeMember() {
  return (
    <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="prose max-w-none text-justify text-base sm:text-lg">
        <Html html={body} />
      </div>
      <style>{`
        .prose .btn {
          display: block;
          width: 100%;
          margin-bottom: 0.75rem;
          font-size: 1.1rem;
        }
        @media (min-width: 640px) {
          .prose .btn {
            display: inline-block;
            width: auto;
            margin-bottom: 0;
            margin-right: 1rem;
          }
        }
        .prose ul, .prose ol {
          padding-left: 1.25rem;
        }
      `}</style>
    </div>
  );
}
