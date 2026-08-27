"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type AnimatedSnapshotCardProps = {
  label: string;
  value: number;
  description: string;
};

export default function AnimatedSnapshotCard({
  label,
  value,
  description,
}: AnimatedSnapshotCardProps) {
  const [displayValue, setDisplayValue] =
    useState(0);

  const cardRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const element = cardRef.current;

    if (!element) return;

    const prefersReducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          !entry.isIntersecting ||
          hasAnimated.current
        ) {
          return;
        }

        hasAnimated.current = true;

        const duration = 1200;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
          const elapsed =
            currentTime - startTime;

          const progress = Math.min(
            elapsed / duration,
            1,
          );

          const easedProgress =
            1 - Math.pow(1 - progress, 3);

          setDisplayValue(
            Math.round(
              value * easedProgress,
            ),
          );

          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };

        requestAnimationFrame(animate);

        observer.disconnect();
      },
      {
        threshold: 0.3,
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [value]);

  return (
    <div
      ref={cardRef}
      className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/30 hover:bg-[#0d1626] sm:p-6"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
        {label}
      </p>

      <p className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
        {displayValue.toLocaleString(
          "en-GB",
        )}
      </p>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}