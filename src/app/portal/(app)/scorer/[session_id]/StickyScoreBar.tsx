"use client";

import { useEffect, useState } from "react";

type StickyScoreBarProps = {
  battingSideName: string;
  score: string;
  overs: string;
};

export default function StickyScoreBar({ battingSideName, score, overs }: StickyScoreBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("scorer-hero-score");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#080b12]/95 px-4 py-2 shadow-lg shadow-black/30 backdrop-blur transition-all duration-200 sm:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 text-sm">
        <span className="truncate font-bold text-zinc-300">{battingSideName}</span>
        <span className="shrink-0 font-black text-white">
          {score}<span className="ml-2 font-semibold text-zinc-500">{overs} ov</span>
        </span>
      </div>
    </div>
  );
}
