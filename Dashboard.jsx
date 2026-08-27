const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const OCEAN_BG = "https://media.db.com/images/public/6a8ffb9d68dbb363d52553fb/2b5736823_big-ole-ocean-dat-took-an-1786344115.webp";

export default function Dashboard() {
  const navigate = useNavigate();
  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{
        backgroundImage: `url(${OCEAN_BG})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#163d6b'
      }}>
      <motion.button
        onClick={() => navigate('/apply')}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.96 }}
        className="font-bungee text-3xl md:text-5xl text-white px-12 py-6 rounded-full border-2 border-white/80 bg-[#FF2E2E] shadow-[0_0_40px_rgba(255,46,46,0.5)]">
        APPLY →
      </motion.button>
    </div>
  );
}