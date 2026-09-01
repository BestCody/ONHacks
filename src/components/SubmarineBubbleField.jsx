import React, { useEffect, useState } from 'react';

const BUBBLE_LIMIT = 3;

function createBubble() {
  const edge = Math.floor(Math.random() * 4);
  let left;
  let top;

  if (edge === 0) {
    left = 12 + Math.random() * 76;
    top = 0 + Math.random() * 18;
  } else if (edge === 1) {
    left = 82 + Math.random() * 18;
    top = 20 + Math.random() * 58;
  } else if (edge === 2) {
    left = 12 + Math.random() * 76;
    top = 82 + Math.random() * 18;
  } else {
    left = 0 + Math.random() * 18;
    top = 20 + Math.random() * 58;
  }

  return {
    id: `${Date.now()}-${Math.random()}`,
    left,
    top,
    size: 0.65 + Math.random() * 0.85,
    duration: 2.4 + Math.random() * 1.2,
    drift: -0.45 + Math.random() * 0.9,
  };
}

export default function SubmarineBubbleField() {
  const [bubbles, setBubbles] = useState([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let active = true;
    let spawnTimeout;

    const scheduleSpawn = () => {
      spawnTimeout = window.setTimeout(() => {
        if (!active) return;
        setBubbles((current) => [...current, createBubble()].slice(-BUBBLE_LIMIT));
        scheduleSpawn();
      }, 900 + Math.random() * 1300);
    };

    scheduleSpawn();

    return () => {
      active = false;
      window.clearTimeout(spawnTimeout);
    };
  }, []);

  return (
    <div className="submarine-organizer-bubble-field" aria-hidden="true">
      {bubbles.map((bubble) => (
        <img
          key={bubble.id}
          src="/assets/bubble-pixel.png"
          alt=""
          draggable="false"
          className="submarine-organizer-floating-bubble pixel-art-asset"
          style={{
            left: `${bubble.left}%`,
            top: `${bubble.top}%`,
            width: `${bubble.size}rem`,
            '--bubble-drift': `${bubble.drift}rem`,
            '--bubble-duration': `${bubble.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
