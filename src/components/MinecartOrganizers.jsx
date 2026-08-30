import React, { useEffect, useLayoutEffect, useRef } from 'react';

const ORGANIZERS = [
  { name: "Ada Lovelace", role: "Lead Curator", tint: "3a3a3a", initial: "AL" },
  { name: "Grace Hopper", role: "Track Lead · AI", tint: "2f2f2f", initial: "GH" },
  { name: "Linus Torvalds", role: "Track Lead · Dev Tools", tint: "333333", initial: "LT" },
  { name: "Satoshi Nakamoto", role: "Track Lead · Web3", tint: "262626", initial: "SN" },
  { name: "Katherine Johnson", role: "Mentor Captain", tint: "3a3a3a", initial: "KJ" },
  { name: "Alan Turing", role: "Security Lead", tint: "2a2a2a", initial: "AT" },
  { name: "Hedy Lamarr", role: "Logistics", tint: "303030", initial: "HL" },
  { name: "Dennis Ritchie", role: "Emcee", tint: "2c2c2c", initial: "DR" }
];

function Bubble({ o, itemRef }) {
  return (
    <div
      ref={itemRef}
      className="absolute left-0 top-0 w-20 h-20 rounded-full overflow-hidden border-2 border-[#7b7b7b] shadow-[0_4px_12px_rgba(0,0,0,0.7)] bg-[#1a1a1a]"
      title={`${o.name} — ${o.role}`}>
      <img
        src={`/assets/organizers/${o.initial}.png`}
        alt={o.name}
        loading="eager"
        className="w-full h-full object-cover opacity-95" />
    </div>
  );
}

export default function MinecartOrganizers() {
  const viewportRef = useRef(null);
  const itemRefs = useRef([]);
  const positionsRef = useRef([]);
  const slotWidthRef = useRef(104);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const resetLayout = () => {
      const slotWidth = Math.max(104, viewport.clientWidth / ORGANIZERS.length);
      slotWidthRef.current = slotWidth;
      positionsRef.current = ORGANIZERS.map((_, index) =>
        index * slotWidth + (slotWidth - 80) / 2
      );

      positionsRef.current.forEach((position, index) => {
        const element = itemRefs.current[index];
        if (element) element.style.transform = `translate3d(${position}px, 0, 0)`;
      });
    };

    resetLayout();
    const observer = new ResizeObserver(resetLayout);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame;
    let previousTime;
    const speed = 32;

    const tick = (time) => {
      if (previousTime === undefined) previousTime = time;
      const delta = Math.min(time - previousTime, 50) / 1000;
      previousTime = time;

      const slotWidth = slotWidthRef.current;
      const cycleWidth = slotWidth * ORGANIZERS.length;
      positionsRef.current = positionsRef.current.map((position, index) => {
        let nextPosition = position - speed * delta;
        if (nextPosition + 80 < 0) nextPosition += cycleWidth;

        const element = itemRefs.current[index];
        if (element) element.style.transform = `translate3d(${nextPosition}px, 0, 0)`;
        return nextPosition;
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={viewportRef} className="relative w-full overflow-hidden py-8">
      <div className="relative h-20 w-full">
        {ORGANIZERS.map((o, index) => (
          <Bubble key={o.initial} o={o} itemRef={(element) => { itemRefs.current[index] = element; }} />
        ))}
      </div>
    </div>
  );
}
