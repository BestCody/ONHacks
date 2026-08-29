import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Trophy, Code2, Brain, Globe, Shield } from 'lucide-react';
import MinecartOrganizers from '@/components/MinecartOrganizers';
import LoadingScreen from '@/components/LoadingScreen';

const VIDEO_URL = "https://media.db.com/videos/public/6a8ffb9d68dbb363d52553fb/ce38382a9_Upscaler-4K-Ultimate-Enhancer-AIUHD-Untitleddesign-ezremove.mp4";
const SEA_BG = "https://media.db.com/images/public/6a8ffb9d68dbb363d52553fb/b67303612_StockCake-Deep_Blue_Pixels-2130883-standard1.jpg";

const TRACKS = [
{ icon: Brain, title: "AI / ML", blurb: "Build neural nets, LLM agents, and systems that think.", prize: "$5K" },
{ icon: Globe, title: "Web3 / Blockchain", blurb: "Decentralized protocols, smart contracts, on-chain apps.", prize: "$4K" },
{ icon: Code2, title: "Developer Tools", blurb: "Ship the next generation of dev infrastructure.", prize: "$3K" },
{ icon: Shield, title: "Security & Privacy", blurb: "Harden systems. Break things. Defend the frontier.", prize: "$3K" }];

const SCHEDULE = [
{ time: "Sat 09:00", label: "Doors Open & Check-in", live: false },
{ time: "Sat 10:30", label: "Opening Ceremony", live: false },
{ time: "Sat 12:00", label: "Hacking Begins", live: true },
{ time: "Sat 18:00", label: "Mentor Office Hours", live: false },
{ time: "Sun 09:00", label: "Mid-Hack Standup", live: false },
{ time: "Sun 16:00", label: "Submissions Due", live: false },
{ time: "Sun 18:00", label: "Judging & Demos", live: false },
{ time: "Sun 20:00", label: "Awards & Closing", live: false }];

function MorphMenu() {
  const [open, setOpen] = useState(false);
  const items = ["Home", "Tracks", "Schedule", "Register"];
  return (
    <div className="fixed top-6 right-6 z-50">
      

      
      <AnimatePresence>
        {open &&
        <motion.nav
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="absolute top-16 right-0 w-64 rounded-full glass-sheet border border-white/20 px-8 py-6 flex flex-col gap-4 origin-top-right">
          
            {items.map((it, i) =>
          <a
            key={it}
            href={`#${it.toLowerCase()}`}
            onClick={() => setOpen(false)}
            className="font-tech text-sm uppercase tracking-widest text-[#F4F4F9] hover:text-[#FF2E2E] transition-colors">
            
                {`0${i + 1}`}  {it}
              </a>
          )}
          </motion.nav>
        }
      </AnimatePresence>
    </div>);

}

function RegisterOverlay({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", track: "" });
  const fields = [
  { key: "name", label: "What's your name?", type: "text", placeholder: "Ada Lovelace" },
  { key: "email", label: "Where do we send updates?", type: "email", placeholder: "you@hack.dev" },
  { key: "track", label: "Pick your battlefield", type: "select", options: TRACKS.map((t) => t.title) }];

  if (!open) return null;
  const current = fields[step];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-[#0A0A0A] flex flex-col items-center justify-center px-6">
      
      <button onClick={onClose} className="absolute top-6 right-6 text-[#F4F4F9]/70 hover:text-[#FF2E2E] transition-colors">
        <X size={28} />
      </button>

      <div className="w-full max-w-2xl">
        <div className="flex gap-2 mb-10">
          {fields.map((f, i) =>
          <div key={f.key} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#FF2E2E]' : 'bg-white/10'}`} />
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="text-center">
            
            <label className="block font-tech text-xs uppercase tracking-[0.3em] text-[#FF2E2E] mb-6">
              Step {step + 1} / 3
            </label>
            <h2 className="text-3xl md:text-5xl font-bubbly text-[#F4F4F9] mb-10">{current.label}</h2>

            {current.type === "select" ?
            <div className="grid grid-cols-2 gap-4">
                {current.options.map((opt) =>
              <button
                key={opt}
                onClick={() => {setForm({ ...form, [current.key]: opt });setStep((s) => s + 1);}}
                className="glass-card rounded-2xl px-6 py-5 font-bungee text-lg text-[#F4F4F9] hover:border-[#FF2E2E] hover:scale-105 transition-all">
                
                    {opt}
                  </button>
              )}
              </div> :

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStep((s) => s + 1);
              }}
              className="flex flex-col items-center gap-6">
              
                <input
                autoFocus
                type={current.type}
                placeholder={current.placeholder}
                value={form[current.key]}
                onChange={(e) => setForm({ ...form, [current.key]: e.target.value })}
                className="w-full max-w-md bg-transparent border-b-2 border-white/20 focus:border-[#FF2E2E] outline-none text-center text-2xl text-[#F4F4F9] placeholder:text-white/30 py-4 caret-[#FF2E2E]" />
              
                <button type="submit" className="font-tech text-sm uppercase tracking-widest text-[#FF2E2E] hover:text-white transition-colors flex items-center gap-2">
                  Continue <ArrowRight size={16} />
                </button>
              </form>
            }
          </motion.div>
        </AnimatePresence>

        {step >= 3 &&
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <h2 className="text-4xl md:text-6xl font-bubbly text-inflated-sm mb-4">You're in.</h2>
            <p className="font-tech text-[#F4F4F9]/70">See you Nov 12. Bring a laptop and an idea.</p>
          </motion.div>
        }
      </div>
    </motion.div>);

}

export default function Home() {
  const navigate = useNavigate();
  const [registerOpen, setRegisterOpen] = useState(false);
  const heroRef = useRef(null);
  const [parallax, setParallax] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const onScroll = () => setParallax(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Safety net: never let the loader hang if the video stalls
  useEffect(() => {
    const t = setTimeout(() => setVideoReady(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="relative text-black overflow-x-hidden"
      style={{ backgroundImage: `url(${SEA_BG})`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundAttachment: 'fixed', backgroundPosition: 'center', backgroundColor: '#051a2d' }}>
      
      <LoadingScreen ready={videoReady} />
      <MorphMenu />

      {/* ===== HERO ===== */}
      <section ref={heroRef} className="relative h-screen w-full overflow-hidden">
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
        {/* legibility veil */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/50 hidden" />
        

        {/* OTHacks + date pinned top-left */}
        <div className="absolute top-0 left-0 p-[10vw]">
          <motion.h1
            initial={{ opacity: 0, y: -30, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: -3 }}
            transition={{ duration: 0.8, type: "spring", bounce: 0.5 }}
            className="font-bubbly text-inflated leading-none"
            style={{ fontSize: "clamp(4rem, 15vw, 12rem)" }}>
            
            OTHacks
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="font-tech mt-4 tracking-[0.2em] font-bold text-xl text-[hsl(var(--foreground))]"
            style={{ fontSize: "clamp(1rem, 2.5vw, 1.5rem)", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
            
            NOV 12 — 13
          </motion.p>
        </div>

        {/* Register CTA bottom-right */}
        <motion.button
          onClick={() => navigate('/apply')}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: "spring" }}
          className="absolute bottom-[10vw] right-[10vw] group">
          
          <span className="block font-bungee text-[#F4F4F9] glass-sheet border border-[#FF2E2E]/60 rounded-full px-[clamp(1.5rem,3vw,2.5rem)] py-[clamp(0.7rem,1.2vw,1.25rem)] text-[clamp(1.25rem,2.2vw,2.25rem)] hover:bg-[#FF2E2E] hover:text-white hover:scale-110 transition-all duration-300 shadow-[0_0_40px_rgba(255,46,46,0.4)]">
            REGISTER →
          </span>
        </motion.button>

        {/* scroll cue */}
        

        
      </section>

      {/* ===== CHALLENGE MATRIX ===== */}
      <section id="tracks" className="relative py-[clamp(2rem,4vw,3.5rem)] px-[10vw]">
        <div className="mb-[clamp(1.5rem,3vw,3rem)]">
          <h2 className="font-bubbly text-inflated-sm mt-3 mb-0 text-xs" style={{ fontSize: "clamp(1.4rem, 2.6vw, 2rem)" }}>
            About
          </h2>
        </div>
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] px-4 md:px-6 pt-5 pb-5">
          <p className="text-black/70 leading-tight mb-0 text-[clamp(0.95rem,1.15vw,1.2rem)]">
            OTHacks is a 12-hour hackathon bringing together 500 builders, designers, and dreamers to turn bold ideas into working prototypes. From the opening ceremony to the final demo, you'll race against the clock alongside some of the sharpest minds in the industry — shipping code, swapping ideas, and learning more in one day than most do in a semester. Expect non-stop coding, mentorship from industry veterans who've built the tools you use every day, free caffeine to keep the momentum alive, hardware and API credits to supercharge your stack, and a shot at glory across four competitive tracks. Whether you're a seasoned hacker or stepping into your first arena, OTHacks is your chance to build something real, meet your next collaborator, and prove what you can do when the clock is ticking. Bring a laptop, bring an idea, and bring your A-game.
          </p>
          <div className="flex gap-6 overflow-x-auto pb-6 no-scrollbar snap-x snap-mandatory">
            {TRACKS.map((t, i) => {
              const Icon = t.icon;
              return null;

            })}
          </div>
        </div>
      </section>

      {/* ===== LOOMING DEADLINE / SCHEDULE ===== */}
      <section id="schedule" className="relative py-[clamp(2rem,4vw,3.5rem)] px-[10vw]">
        <div className="mb-[clamp(1.5rem,3vw,3rem)]">
          <h2 className="font-bubbly text-inflated-sm mt-3 mb-0 text-xs" style={{ fontSize: "clamp(1.4rem, 2.6vw, 2rem)" }}>
            Live Schedule
          </h2>
        </div>
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] px-[clamp(1.25rem,2.5vw,2.5rem)] py-[clamp(1.25rem,2vw,2.5rem)]">
          <div className="max-w-3xl">
            {SCHEDULE.map((s, i) =>
            <motion.div
              key={s.time}
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.05 }}
              className="relative flex items-center gap-[clamp(0.75rem,1.5vw,1.25rem)] py-[clamp(0.5rem,0.8vw,0.85rem)] border-l-2 pl-[clamp(1rem,1.8vw,1.5rem)]"
              style={{ borderColor: s.live ? "#FF2E2E" : "rgba(0,0,0,0.1)" }}>
              
                <span
                className={`absolute -left-[6px] w-2.5 h-2.5 rounded-full ${s.live ? "bg-[#FF2E2E] shadow-[0_0_12px_#FF2E2E] animate-pulse" : "bg-black/20"}`} />
              
                <span className="font-tech text-[clamp(0.75rem,0.9vw,0.95rem)] text-black w-[clamp(5.5rem,9vw,7.5rem)] shrink-0">{s.time}</span>
                <span className={`text-[clamp(0.8rem,1vw,1.05rem)] ${s.live ? "text-black font-bold" : "text-black/80"}`}>{s.label}</span>
                
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ===== COMMAND CENTER / REGISTER ===== */}
      <section id="register" className="relative py-32 px-[10vw] text-center hidden">
        <Trophy className="mx-auto text-[#FF2E2E] mb-6 hidden" size={48} />
        <h2 className="font-bubbly text-inflated-sm mb-6 hidden" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>
          48 Hours.<br />One Arena.
        </h2>
        <p className="text-[#0A1A2A]/70 max-w-xl mx-auto mb-10 leading-relaxed hidden">
          Join 500 builders for two days of relentless creation. Mentorship, caffeine, and glory await.
        </p>
        <button
          onClick={() => setRegisterOpen(true)}
          className="font-bungee text-xl md:text-2xl text-white bg-[#FF2E2E] rounded-full px-12 py-5 hover:scale-110 transition-transform shadow-[0_0_50px_rgba(255,46,46,0.5)] hidden">
          
          CLAIM YOUR SPOT →
        </button>
      </section>

      {/* ===== SPONSOR STRIP ===== */}
      <section id="sponsors" className="relative py-[clamp(1.75rem,3.5vw,3rem)] px-[10vw]">
        
        <h2 className="font-bubbly text-inflated-sm mt-3 mb-[clamp(1.5rem,3vw,3rem)] text-xs" style={{ fontSize: "clamp(1.4rem, 2.6vw, 2rem)" }}>Sponsors</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.75rem,1.5vw,1.5rem)]">
          {Array.from({ length: 8 }).map((_, i) =>
          <motion.div
            key={i}
            initial={{ rotate: 0 }}
            animate={{ rotate: 0 }}
            whileHover={{ rotate: [0, -4, 4, -3, 2, 0] }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
            className="glass-card-light rounded-xl h-[clamp(3rem,5vw,4.5rem)] flex items-center justify-center font-tech text-[clamp(0.65rem,0.8vw,0.85rem)] uppercase tracking-widest text-black/50 cursor-pointer">
              Sponsor {i + 1}
            </motion.div>
          )}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="relative py-[clamp(1.75rem,3.5vw,3rem)] px-[10vw]">
        
        <h2 className="font-bubbly text-inflated-sm mt-3 mb-[clamp(1.5rem,3vw,3rem)] text-xs" style={{ fontSize: "clamp(1.4rem, 2.6vw, 2rem)" }}>FAQ</h2>
        <div className="max-w-3xl space-y-[clamp(0.75rem,1.2vw,1.25rem)]">
          {Array.from({ length: 6 }).map((_, i) =>
          <div key={i} className="glass-card-light rounded-xl p-[clamp(0.85rem,1.5vw,1.5rem)]">
              <p className="font-bungee text-[clamp(0.85rem,1.1vw,1.15rem)] text-black mb-[clamp(0.3rem,0.5vw,0.5rem)]">Frequently asked question {i + 1}?</p>
              <p className="text-black/60 leading-relaxed text-[clamp(0.75rem,0.95vw,1rem)]">Placeholder answer goes here. Replace with real FAQ content.</p>
            </div>
          )}
        </div>
      </section>

      {/* ===== ORGANIZERS — MINECART INFINITE SCROLL ===== */}
      <section id="organizers" className="relative py-[clamp(1.75rem,3.5vw,3rem)]">
        <div className="px-[10vw] mb-[clamp(1.25rem,2.5vw,2.5rem)]">
          
          <h2 className="font-bubbly text-inflated-sm mt-3 mb-2 text-xs" style={{ fontSize: "clamp(1.4rem, 2.6vw, 2rem)" }}>Organizers</h2>
          
        </div>
        <MinecartOrganizers />
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 bg-[#0A0A0A] border-t border-white/10 py-[clamp(1rem,2vw,2rem)] px-[10vw] flex flex-col md:flex-row justify-between gap-[clamp(0.5rem,1vw,1rem)] items-center">
        <span className="font-bubbly text-inflated-sm text-[clamp(1rem,1.5vw,1.5rem)]">OTHacks</span>
        <span className="font-tech text-[clamp(0.6rem,0.75vw,0.8rem)] uppercase tracking-[0.3em] text-white/50">Nov 12-13 · Built by builders, for builders</span>
      </footer>

      <AnimatePresence>
        <RegisterOverlay open={registerOpen} onClose={() => setRegisterOpen(false)} />
      </AnimatePresence>
    </div>);

}
