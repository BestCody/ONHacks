import React, { useEffect, useLayoutEffect, useRef } from 'react';
import SubmarineBubbleField from './SubmarineBubbleField';

const ORGANIZERS = [
  { name: 'Ben Hadfield', image: '/assets/organizers/Ben Hadfield.png' },
  {
    name: 'Caseyna Ponniah',
    image: '/assets/organizers/Caseyna Ponniah.png',
    linkedin: 'https://www.linkedin.com/in/caseyna-ponniah-2498433b6?utm_source=share_via&utm_content=profile&utm_medium=member_ios',
  },
  {
    name: 'Charlie Shao',
    image: '/assets/organizers/Charlie Shao.png',
    linkedin: 'https://www.linkedin.com/in/charlie-shao-499b38382/',
  },
  { name: 'Hanze Lou', image: '/assets/organizers/Hanze Lou.png' },
  { name: 'Joel Daniel', image: '/assets/organizers/Joel Daniel.png' },
  { name: 'Maha Latify', image: '/assets/organizers/Maha Latify.png' },
  {
    name: 'Michelle Wu',
    image: '/assets/organizers/Michelle Wu.png',
    linkedin: 'https://www.linkedin.com/in/minghan-michelle-wu-b36199318',
  },
  { name: 'Nicholas Ossine', image: '/assets/organizers/Nicholas Ossine.png' },
  { name: 'Wenxuan Su', image: '/assets/organizers/Wenxuan Su.png' },
];

function SubmarineCard({ organizer, itemRef }) {
  const cardContent = (
    <>
      <span className="submarine-organizer-name" aria-hidden="true">
        {organizer.name}
      </span>
      <img
        src="/assets/submarine.png"
        alt=""
        aria-hidden="true"
        draggable="false"
        className="submarine-organizer-art pixel-art-asset"
      />
      <span className="submarine-organizer-portal" aria-hidden="true">
        <img
          src={organizer.image}
          alt=""
          loading="lazy"
          draggable="false"
          className="submarine-organizer-portrait"
        />
      </span>
    </>
  );

  if (organizer.linkedin) {
    return (
      <a
        ref={itemRef}
        className="submarine-organizer-card submarine-organizer-card--linked"
        href={organizer.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${organizer.name}'s LinkedIn profile`}
        aria-label={`${organizer.name}, organizer. Open LinkedIn profile in a new tab`}>
        {cardContent}
      </a>
    );
  }

  return (
    <div
      ref={itemRef}
      className="submarine-organizer-card"
      tabIndex={0}
      title={organizer.name}
      aria-label={`${organizer.name}, organizer`}>
      {cardContent}
    </div>
  );
}

export default function SubmarineOrganizers() {
  const viewportRef = useRef(null);
  const itemRefs = useRef([]);
  const layoutRef = useRef({ positions: [], cycleWidth: 0, itemWidth: 0, ready: false });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const resetLayout = () => {
      const items = itemRefs.current.filter(Boolean);
      if (!items.length) return;

      const itemWidth = items[0].getBoundingClientRect().width || 280;
      const minimumGap = Math.max(2 * 16, itemWidth * 0.18);
      const slotWidth = Math.max(itemWidth + minimumGap, viewport.clientWidth / items.length);
      const cycleWidth = slotWidth * items.length;
      const positions = items.map((_, index) => index * slotWidth);

      layoutRef.current = { positions, cycleWidth, itemWidth, ready: true };
      items.forEach((element, index) => {
        element.style.transform = `translate3d(${positions[index]}px, -50%, 0)`;
      });
    };

    resetLayout();
    const observer = new ResizeObserver(resetLayout);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let frame;
    let previousTime;
    const speed = 30;

    const tick = (time) => {
      if (previousTime === undefined) previousTime = time;
      const delta = Math.min(time - previousTime, 50) / 1000;
      previousTime = time;

      const layout = layoutRef.current;
      if (layout.ready && layout.cycleWidth > 0) {
        layout.positions = layout.positions.map((position, index) => {
          let nextPosition = position - speed * delta;
          if (nextPosition + layout.itemWidth < 0) nextPosition += layout.cycleWidth;

          const element = itemRefs.current[index];
          if (element) element.style.transform = `translate3d(${nextPosition}px, -50%, 0)`;
          return nextPosition;
        });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={viewportRef}
      className="submarine-organizers-viewport"
      aria-label="ONHacks organizers">
      <SubmarineBubbleField />
      <div className="submarine-organizers-track">
        {ORGANIZERS.map((organizer, index) => (
          <SubmarineCard
            key={organizer.name}
            organizer={organizer}
            itemRef={(element) => {
              itemRefs.current[index] = element;
            }}
          />
        ))}
      </div>
    </div>
  );
}
