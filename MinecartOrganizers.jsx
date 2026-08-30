import React from 'react';
import { motion } from 'framer-motion';

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

function Bubble({ o }) {
  return (
    <div
      className="shrink-0 w-20 h-20 mx-3 rounded-full overflow-hidden border-2 border-[#7b7b7b] shadow-[0_4px_12px_rgba(0,0,0,0.7)] bg-[#1a1a1a]"
      title={`${o.name} — ${o.role}`}>
      <img
        src={`/assets/organizers/${o.initial}.png`}
        alt={o.name}
        loading="lazy"
        className="w-full h-full object-cover opacity-95" />
    </div>
  );
}

export default function MinecartOrganizers() {
  const loop = [...ORGANIZERS, ...ORGANIZERS];
  return (
    <div className="relative w-full overflow-hidden py-8">
      <div className="w-full overflow-hidden">
        <motion.div
          className="flex"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 26, repeat: Infinity, ease: "linear" }}>
          {loop.map((o, i) => (
            <Bubble key={i} o={o} />
          ))}
        </motion.div>
      </div>
    </div>
  );
}
