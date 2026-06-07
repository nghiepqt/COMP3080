'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon } from '@phosphor-icons/react';

interface ThemeToggleProps {
  className?: string;
  iconSize?: number;
}

export function ThemeToggle({ className = '', iconSize = 15 }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = theme === 'system' && mounted 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
    : theme;

  const toggleTheme = () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  if (!mounted) {
    return <div className="w-8 h-8" />; // Placeholder to prevent hydration layouts shift
  }

  return (
    <AnimatePresence mode="wait">
      <motion.button
        key={currentTheme}
        onClick={toggleTheme}
        initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
        transition={{ duration: 0.2 }}
        className={`p-2 rounded hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors cursor-pointer ${className}`}
        aria-label="Toggle theme"
      >
        {currentTheme === 'dark' ? (
          <Sun size={iconSize} weight="duotone" className="text-accent-gold" />
        ) : (
          <Moon size={iconSize} weight="duotone" className="text-accent-mint" />
        )}
      </motion.button>
    </AnimatePresence>
  );
}
