import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Instagram } from 'lucide-react';
import { motion } from 'framer-motion';
import LoadingScreen from '@/components/LoadingScreen';
import SubmarineOrganizers from '@/components/SubmarineOrganizers';

const VIDEO_URL = "/assets/hero.mp4";
const MASCOT_ART = "/assets/download.png";
const WHALE_SPRITE = "/assets/whale_sprite_sheet.png";

// These points follow the centerline of the CSS stream, from the viewport's
// left edge to its right edge. Keeping them in percentages makes the route
// responsive while keeping the whale inside the water at every bend.
const STREAM_PATH = [
  { x: 0, y: 10, angle: 27 },
  { x: 18, y: 10, angle: 31 },
  { x: 36, y: 21, angle: 38 },
  { x: 52, y: 39, angle: 43 },
  { x: 68, y: 64, angle: 42 },
  { x: 84, y: 87, angle: 39 },
  { x: 100, y: 94, angle: 35 },
];

const WHALE_SPRITE_FRAMES = [-24, -62, -104, -150, -190, -243, -292];
const WHALE_TURN_FRAMES = [-24, -73, -116, -211, -271];
const WHALE_TURN_X = -145;

const FAQ_ITEMS = [
  {
    question: 'What is a hackathon?',
    answer:
      'A hackathon is a focused build event where people collaborate to turn an idea into a working prototype in a limited amount of time. At ONHacks, you will have 12 hours to learn, build, and share what you make.',
  },
  {
    question: 'Who can participate?',
    answer:
      'ONHacks is for high-school students of all experience levels. You can join whether you already code or are simply curious about building something—your willingness to learn and collaborate matters most.',
  },
  {
    question: 'Is it free? Will food be provided?',
    answer:
      'Student hackathons are often free and provide food or snacks through sponsors. ONHacks will confirm its registration fee, meal plan, and dietary options in the event details shared with participants.',
  },
  {
    question: 'What should my project be about?',
    answer:
      'There is no single required theme. Start with a problem or idea your team cares about and build something meaningful, useful, or fun. Scope it to a working prototype that you can complete within the 12-hour build window.',
  },
  {
    question: 'How many people are in a team?',
    answer:
      'Team limits vary by event, so the final ONHacks maximum will be listed in registration. Small teams of two to four are common because they make it easier to share skills, divide the work, and finish a prototype.',
  },
  {
    question: 'How will we communicate during the event?',
    answer:
      'Organizers will share the event communication channel before the hackathon. Use it for announcements, help requests, mentor updates, and questions, while your team can use its own group chat for day-to-day coordination.',
  },
  {
    question: 'Can I participate remotely?',
    answer:
      'Remote participation depends on the event format. Check the registration details for whether ONHacks offers a remote option and which tools remote teams should use if one is available.',
  },
  {
    question: "What if I don't know how to code?",
    answer:
      'That is completely okay. Hackathons also need designers, researchers, writers, presenters, planners, and idea people. Ask mentors for help, learn as you go, and contribute in a role that fits your strengths.',
  },
];

function getStreamPoint(progress) {
  const scaledProgress = progress * (STREAM_PATH.length - 1);
  const segment = Math.min(Math.floor(scaledProgress), STREAM_PATH.length - 2);
  const segmentProgress = scaledProgress - segment;
  const start = STREAM_PATH[segment];
  const end = STREAM_PATH[segment + 1];

  return {
    x: start.x + (end.x - start.x) * segmentProgress,
    y: start.y + (end.y - start.y) * segmentProgress,
    angle: start.angle + (end.angle - start.angle) * segmentProgress,
  };
}

function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  if (window.location.hash) {
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  }

  const navigation = document.querySelector('.site-nav');
  const navigationOffset = (navigation?.getBoundingClientRect().height || 0) + 24;
  const top = section.getBoundingClientRect().top + window.scrollY - navigationOffset;

  window.scrollTo({
    top: Math.max(0, top),
    behavior: 'smooth',
  });
}

export default function Home() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const aboutSectionRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const previousScrollDirectionRef = useRef('down');
  const [parallax, setParallax] = useState(0);
  const [streamProgress, setStreamProgress] = useState(0);
  const [scrollDirection, setScrollDirection] = useState('down');
  const [whaleFrame, setWhaleFrame] = useState(0);
  const [turning, setTurning] = useState(false);
  const [turnFrame, setTurnFrame] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      setParallax(window.scrollY);
      lastScrollYRef.current = currentScrollY;

      if (!reducedMotion && currentScrollY !== previousScrollY) {
        setScrollDirection(currentScrollY > previousScrollY ? 'down' : 'up');
      }

      const section = aboutSectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const start = window.innerHeight * 0.78;
      const end = -rect.height + window.innerHeight * 0.22;
      const progress = (start - rect.top) / (start - end);

      setStreamProgress(reducedMotion ? 0.48 : Math.max(0, Math.min(1, progress)));
    };

    lastScrollYRef.current = window.scrollY;
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId) return undefined;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;

    const syncFaqGap = () => {
      if (!active) return;

      const lastPartnerBubble = document.querySelector('#partners .partner-bubble:last-child');
      const sponsorsHeading = document.getElementById('sponsors-heading');
      const lastSponsorBubble = document.querySelector('#sponsors .partner-bubble:last-child');
      const faqSection = document.getElementById('faq');

      if (!lastPartnerBubble || !sponsorsHeading || !lastSponsorBubble || !faqSection) return;

      const partnerToSponsorsGap =
        sponsorsHeading.getBoundingClientRect().top - lastPartnerBubble.getBoundingClientRect().bottom;
      const faqSectionOffset =
        faqSection.getBoundingClientRect().top - lastSponsorBubble.getBoundingClientRect().bottom;
      const faqTopGap = Math.max(0, partnerToSponsorsGap - faqSectionOffset);

      faqSection.style.setProperty('--faq-top-gap', `${faqTopGap}px`);
    };

    syncFaqGap();
    window.addEventListener('resize', syncFaqGap);
    document.fonts?.ready.then(syncFaqGap);

    return () => {
      active = false;
      window.removeEventListener('resize', syncFaqGap);
    };
  }, []);

  useEffect(() => {
    if (previousScrollDirectionRef.current === scrollDirection) return undefined;

    previousScrollDirectionRef.current = scrollDirection;
    setTurning(true);
    setTurnFrame(scrollDirection === 'up' ? 0 : WHALE_TURN_FRAMES.length - 1);

    return undefined;
  }, [scrollDirection]);

  useEffect(() => {
    if (!turning) return undefined;

    const timeout = window.setTimeout(() => {
      const step = scrollDirection === 'up' ? 1 : -1;
      setTurnFrame((frame) => Math.max(0, Math.min(WHALE_TURN_FRAMES.length - 1, frame + step)));
    }, 90);

    return () => window.clearTimeout(timeout);
  }, [turning, turnFrame, scrollDirection]);

  useEffect(() => {
    if (!turning) return;

    const turnFinished = scrollDirection === 'up'
      ? turnFrame === WHALE_TURN_FRAMES.length - 1
      : turnFrame === 0;

    if (turnFinished) setTurning(false);
  }, [turning, turnFrame, scrollDirection]);

  useEffect(() => {
    const timeout = setTimeout(() => setVideoReady(true), 4000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const interval = window.setInterval(() => {
      setWhaleFrame((frame) => (frame + 1) % WHALE_SPRITE_FRAMES.length);
    }, 180);

    return () => window.clearInterval(interval);
  }, []);

  const whalePoint = getStreamPoint(streamProgress);
  const whaleRotation = whalePoint.angle + 180;
  const whaleTurnFrame = turning ? WHALE_TURN_FRAMES[turnFrame] : null;
  const whaleSpriteTransform = whaleTurnFrame === null
    ? `translateY(${WHALE_SPRITE_FRAMES[whaleFrame]}px)`
    : `translateX(${WHALE_TURN_X}px) translateY(${whaleTurnFrame}px)`;
  const whaleDirectionTransform = `rotate(${whaleRotation}deg) scaleY(-1)${
    scrollDirection === 'up' ? ' scaleX(-1)' : ''
  }`;

  return (
    <div className="relative overflow-x-hidden bg-[#06283d] text-black">
      <LoadingScreen ready={videoReady} />

      <section id="top" ref={heroRef} className="relative h-screen w-full overflow-hidden">
        <header className="site-nav" aria-label="Site navigation">
          <nav className="site-nav-left" aria-label="Primary navigation">
            <button
              type="button"
              onClick={() => scrollToSection('top')}
              className="site-nav-mascot-link"
              aria-label="ONHacks home">
              <img src={MASCOT_ART} alt="" className="site-nav-mascot pixel-whale" />
            </button>
            <div className="site-nav-links">
              <button type="button" onClick={() => scrollToSection('tracks')}>About</button>
              <button type="button" onClick={() => scrollToSection('partners')}>Partners</button>
              <button type="button" onClick={() => scrollToSection('sponsors')}>Sponsors</button>
              <button type="button" onClick={() => scrollToSection('faq')}>FAQs</button>
              <button type="button" onClick={() => scrollToSection('organizers')}>Organizers</button>
            </div>
          </nav>
          <div className="site-nav-actions">
            <button
              type="button"
              onClick={() => navigate('/signin?returnTo=%2Fdashboard')}
              className="site-nav-register">
              Register
            </button>
            <a
              href="https://www.instagram.com/onhacks_/"
              target="_blank"
              rel="noreferrer"
              className="site-nav-instagram"
              aria-label="ONHacks on Instagram">
              <Instagram size={19} strokeWidth={2.25} aria-hidden="true" />
            </a>
          </div>
        </header>

        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={() => setVideoReady(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: `translateY(${parallax * 0.5}px) scale(1.1)` }}>
          <source src={VIDEO_URL} type="video/mp4" />
        </video>

        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/50 hidden" />

        <div className="hero-copy absolute left-0">
          <motion.h1
            initial={{ opacity: 0, y: -30, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: -3 }}
            transition={{ duration: 0.8, type: "spring", bounce: 0.5 }}
            className="font-bubbly text-inflated leading-none"
            style={{ fontSize: "clamp(4rem, 15vw, 12rem)" }}>
            ONHACKS
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="font-tech mt-4 tracking-[0.2em] font-bold text-xl text-[hsl(var(--foreground))]"
            style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
            NOVEMBER 18
          </motion.p>
        </div>

        <motion.button
          onClick={() => navigate('/signin?returnTo=%2Fdashboard')}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: "spring" }}
          className="absolute bottom-[10vw] right-[10vw] group">
          <span className="block font-bungee text-[#F4F4F9] glass-sheet border border-[#FF2E2E]/60 rounded-full px-[clamp(1.5rem,3vw,2.5rem)] py-[clamp(0.7rem,1.2vw,1.25rem)] text-[clamp(1.25rem,2.2vw,2.25rem)] hover:bg-[#FF2E2E] hover:text-white hover:scale-110 transition-all duration-300 shadow-[0_0_40px_rgba(255,46,46,0.4)]">
            REGISTER →
          </span>
        </motion.button>
      </section>

      <section
        ref={aboutSectionRef}
        id="tracks"
        aria-labelledby="about-onhacks-heading our-mission-heading"
        className="about-river-section">
        <div className="about-river-stage">
          <div className="about-river-stream" aria-hidden="true">
            <div
              className="about-river-whale"
              style={{
                left: `${whalePoint.x}%`,
                top: `${whalePoint.y}%`,
              }}>
              <div
                className="about-river-whale-direction"
                style={{ transform: whaleDirectionTransform }}>
                <img
                  src={WHALE_SPRITE}
                  alt=""
                  className="about-river-whale-sheet pixel-whale"
                  style={{ transform: whaleSpriteTransform }}
                />
              </div>
            </div>
          </div>

          <img
            src="/assets/beach1.png"
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="about-river-beach pixel-art-asset"
          />

          <article className="about-river-block about-river-block--onhacks">
            <h2 id="about-onhacks-heading" className="about-river-title font-bubbly">
              About ONHacks
            </h2>
            <p>
              ONHacks is a hackathon where students come together to explore technology,
              collaborate with others, and turn their ideas into creative projects. It&apos;s
              an opportunity to learn, build, and have fun while solving real-world problems.
            </p>
          </article>

          <article className="about-river-block about-river-block--mission">
            <h2 id="our-mission-heading" className="about-river-title font-bubbly">
              Our Mission
            </h2>
            <p>
              ONHacks is designed to provide high-school students with an opportunity to
              learn, collaborate, and build something exciting in a welcoming environment.
            </p>
          </article>
        </div>
      </section>

      <section
        id="partners"
        aria-labelledby="partners-heading"
        className="beach-texture-section">
        <div className="beach-texture-section-inner">
          <h2 id="partners-heading" className="beach-texture-title font-bubbly">
            Our Partners
          </h2>
          <div className="partners-bubble-grid" aria-label="Partner placeholders">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="partner-bubble"
                role="img"
                aria-label={`Partner ${index + 1} placeholder`}>
                PARTNER
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="sponsors"
        aria-labelledby="sponsors-heading"
        className="sponsors-heading-section">
        <h2 id="sponsors-heading" className="sponsors-heading font-bubbly">
          Our Sponsors
        </h2>
        <div className="partners-bubble-grid sponsors-bubble-grid" aria-label="Sponsor placeholders">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="partner-bubble"
              role="img"
              aria-label={`Sponsor ${index + 1} placeholder`}>
              SPONSOR
            </div>
          ))}
        </div>
      </section>

      <section
        id="faq"
        aria-labelledby="faq-heading"
        className="sponsors-depth-transition">
        <div className="faq-transition-content">
          <h2 id="faq-heading" className="faq-transition-title font-bubbly">
            FAQ
          </h2>
          <div className="faq-question-list" role="list" aria-label="Frequently asked questions">
            {FAQ_ITEMS.map(({ question, answer }) => (
              <details key={question} className="faq-question" role="listitem">
                <summary>
                  <span>{question}</span>
                  <ChevronDown
                    className="faq-question-chevron"
                    size={22}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </summary>
                <p className="faq-answer">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section
        id="organizers"
        aria-labelledby="organizers-heading"
        className="submarine-organizers-section">
        <img
          src="/assets/ocean-floor.png"
          alt=""
          aria-hidden="true"
          draggable="false"
          className="organizer-ocean-floor"
        />
        <div className="organizer-coral-corners" aria-hidden="true">
          <img
            src="/assets/coral-fan-red.png"
            alt=""
            draggable="false"
            className="organizer-coral organizer-coral--left pixel-art-asset"
          />
          <img
            src="/assets/coral2.png"
            alt=""
            draggable="false"
            className="organizer-coral organizer-coral--right pixel-art-asset"
          />
        </div>
        <h2 id="organizers-heading" className="submarine-organizers-title font-bubbly">
          Organizers
        </h2>
        <SubmarineOrganizers />
      </section>
      <div className="sponsors-deep-blue-section" aria-hidden="true" />
    </div>
  );
}
