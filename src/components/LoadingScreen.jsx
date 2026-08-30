import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoadingScreen({ ready }) {
  return (
    <AnimatePresence>
      {!ready && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center pointer-events-none"
        >
          <div className="w-12 h-12 border-4 border-white/15 border-t-white rounded-full animate-spin" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}