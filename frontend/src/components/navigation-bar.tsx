'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import DevNetworkToggle from '@/components/DevNetworkToggle';
import { CaretDown, Wallet, User, Bank, SignOut } from '@phosphor-icons/react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { ThemeToggle } from '@/components/ThemeToggle';
import { truncateAddress } from '@/lib/utils';

export default function NavigationBar() {
  const { account, activeRole, authStatus, loginUser, disconnectWallet } = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Dropdown states
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const connectRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll();

  // Handle scroll detection using framer-motion scrollY (compliance with design-taste-frontend scroll listener rule)
  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 20);
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (connectRef.current && !connectRef.current.contains(event.target as Node)) {
        setIsConnectOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  const handleConnectRole = async (role: 'collector' | 'museum') => {
    setIsConnectOpen(false);
    try {
      await loginUser(role);
      // Auto-redirect upon successful authentication (Requirement 1)
      if (role === 'museum') {
        router.push('/museum');
      } else {
        router.push('/collector');
      }
    } catch (err) {
      console.error("Authentication failed inside navigation bar connect hook:", err);
    }
  };

  const getRoleDisplayName = (role: string) => {
    if (role === 'museum') return 'Museum Partner';
    return 'Collector';
  };

  return (
    <header 
      className={`sticky top-0 z-50 w-full transition-all duration-500 ease-out border-b ${
        isScrolled 
          ? 'h-16 bg-background/80 dark:bg-background/85 backdrop-blur-md border-border shadow-sm' 
          : 'h-20 bg-transparent border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/museum_dashboard.png" alt="iHeritage Logo" className="h-16 w-auto object-contain" />
            <span className="hidden sm:inline-block text-[9px] font-mono uppercase tracking-[0.2em] border border-border px-2 py-0.5 rounded text-text-secondary bg-surface-elevated/40">
              Web3 Provenance
            </span>
          </Link>

          {/* Controls */}
          <div className="flex items-center gap-4">

            {/* Theme Toggle */}
            <div className="relative w-9 h-9 flex items-center justify-center">
              <ThemeToggle className="p-2.5 rounded-full border border-border/40" iconSize={14} />
            </div>

            {/* Dev-Mode Network Switcher */}
            <DevNetworkToggle />

            {/* Unified persistent Wallet Connector */}
            {account ? (
              /* Authenticated Profile Dropdown */
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-border bg-surface hover:bg-surface-elevated transition-all duration-200 text-xs font-semibold text-text-primary cursor-pointer select-none shadow-xs"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-mint/75 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-mint"></span>
                  </span>
                  <span className="font-mono text-[11.5px] text-text-secondary">{truncateAddress(account)}</span>
                  <CaretDown size={12} className={`text-text-secondary opacity-60 transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isProfileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute right-0 z-50 mt-2.5 w-60 rounded-xl border border-border/80 bg-surface/95 backdrop-blur-md shadow-lg overflow-hidden focus:outline-none p-2"
                    >
                      <div className="px-3 py-2 border-b border-border/60">
                        <p className="text-[10px] uppercase tracking-wider text-text-secondary font-mono">Role Account</p>
                        <p className="text-xs font-semibold text-text-primary font-serif truncate mt-0.5">{getRoleDisplayName(activeRole)}</p>
                      </div>

                      <div className="py-1">
                        <Link
                          href={activeRole === 'museum' ? '/museum' : '/collector'}
                          onClick={() => setIsProfileOpen(false)}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-surface-elevated/70 rounded transition-colors duration-150 cursor-pointer font-medium"
                        >
                          {activeRole === 'museum' ? <Bank size={14} className="text-accent-gold" /> : <User size={14} className="text-accent-mint" />}
                          <span>Access Portal Console</span>
                        </Link>
                        
                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            disconnectWallet();
                            router.push('/');
                          }}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 rounded transition-colors duration-150 cursor-pointer font-medium mt-1"
                        >
                          <SignOut size={14} />
                          <span>Disconnect Wallet</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* Connect Dropdown Button (Unified flow - Requirement 3) */
              <div className="relative" ref={connectRef}>
                <button
                  onClick={() => setIsConnectOpen(!isConnectOpen)}
                  disabled={['CONNECTING_WALLET', 'FETCHING_NONCE', 'SIGNING_MESSAGE', 'VERIFYING_SIGNATURE'].includes(authStatus)}
                  className="bg-text-primary text-background dark:bg-text-primary dark:text-background text-xs uppercase tracking-wider font-semibold px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Wallet size={14} weight="fill" />
                  <span>
                    {authStatus === 'CONNECTING_WALLET' ? 'Connecting...' 
                     : authStatus === 'SIGNING_MESSAGE' ? 'Signing...' 
                     : 'Connect Wallet'}
                  </span>
                  <CaretDown size={11} className={`opacity-80 transition-transform duration-200 ${isConnectOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isConnectOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute right-0 z-50 mt-2.5 w-64 rounded-xl border border-border/80 bg-surface/95 backdrop-blur-md shadow-lg overflow-hidden focus:outline-none p-2"
                    >
                      <div className="px-3 py-2 border-b border-border/60">
                        <p className="text-[10px] uppercase tracking-widest text-text-secondary font-mono">Select Security Gateway</p>
                        <p className="text-xs text-text-primary font-medium mt-0.5">Authorise with credentials</p>
                      </div>

                      <div className="py-1.5 space-y-1">
                        <button
                          onClick={() => handleConnectRole('collector')}
                          className="flex flex-col w-full text-left px-3 py-2.5 hover:bg-surface-elevated/70 rounded transition-colors duration-150 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                            <User size={14} className="text-accent-mint" />
                            <span>Collector Gateway</span>
                          </span>
                          <span className="text-[10px] text-text-secondary mt-0.5 pl-5">Trade, offer, and list fragments</span>
                        </button>

                        <button
                          onClick={() => handleConnectRole('museum')}
                          className="flex flex-col w-full text-left px-3 py-2.5 hover:bg-surface-elevated/70 rounded transition-colors duration-150 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                            <Bank size={14} className="text-accent-gold" />
                            <span>Museum Partner Portal</span>
                          </span>
                          <span className="text-[10px] text-text-secondary mt-0.5 pl-5">Govern provenance & mint master pieces</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </div>

        </div>
      </div>
    </header>
  );
}
