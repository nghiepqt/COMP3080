'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import { useAccount, useSwitchChain } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Sparkle,
  CircleNotch,
  ShieldCheck,
  Compass,
  Bank,
  Quotes,
  Stack,
  Swap
} from '@phosphor-icons/react';
import Image from 'next/image';
import AuthLoadingPortal from '@/components/AuthLoadingPortal';
export default function Home() {
  const router = useRouter();
  const { account, activeRole, authStatus, loginUser, isLoggingIn } = useWallet();
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [redirecting, setRedirecting] = useState(false);

  // 1. Smart Authentication Routing
  useEffect(() => {
    if (account) {
      setRedirecting(true);
      if (activeRole === 'museum') {
        router.push('/museum');
      } else if (activeRole === 'collector') {
        router.push('/collector');
      }
    }
  }, [account, activeRole, router]);

  const handleLogin = async (chosenRole: 'collector' | 'museum') => {
    try {
      const allowedChains = [80002, 31338, 9999];
      if (isConnected && chainId && !allowedChains.includes(chainId)) {
        try {
          await switchChainAsync({ chainId: 9999 });
        } catch (err) {
          console.error("User rejected network switch or switch failed:", err);
          throw new Error("Incorrect Network. Please switch your wallet to Amoy, Anvil Private, or Anvil Public.");
        }
      }
      await loginUser(chosenRole);
    } catch (e) {
      console.error(e);
      setRedirecting(false);
    }
  };

  const showLoadingOverlay = isLoggingIn || redirecting || ['CONNECTING_WALLET', 'CONNECTED_UNAUTH', 'FETCHING_NONCE', 'SIGNING_MESSAGE', 'VERIFYING_SIGNATURE'].includes(authStatus);

  if (showLoadingOverlay) {
    return (
      <AuthLoadingPortal
        authStatus={authStatus}
        isInitialized={true}
        redirecting={redirecting}
      />
    );
  }

  return (
    <div className="relative font-sans overflow-hidden bg-background">

      {/* Decorative Grid Mesh (Digital Brutalism overlay) */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-12 pointer-events-none opacity-5 border-x border-border z-0">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="border-r border-border h-full" />
        ))}
      </div>

      {/* SECTION 1: ASYMMETRIC LANDING HERO */}
      <section className="relative min-h-[85vh] flex items-center justify-center text-center overflow-hidden">
        {/* Premium Background Image Container with Blur Transitions */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/hero-bg.jpg"
            alt="iHeritage Hero Background"
            fill
            priority
            className="object-cover object-center pointer-events-none select-none"
          />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-black/45" />

          {/* Top Blur & Gradient Fade (Harmonizes with Transparent Header & Background) */}
          <div 
            className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-background via-background/60 to-transparent backdrop-blur-md pointer-events-none" 
            style={{
              maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)'
            }}
          />

          {/* Bottom Blur & Gradient Fade (Harmonizes with Content Background) */}
          <div 
            className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-background via-background/60 to-transparent backdrop-blur-md pointer-events-none" 
            style={{
              maskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 100%)'
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center space-y-8 px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.25em] font-mono text-accent-gold uppercase font-bold bg-white/5 border border-white/10 px-3 py-1 rounded-full backdrop-blur-xs">
            <Sparkle size={10} weight="fill" className="animate-pulse text-accent-gold" />
            <span>Digital Sovereignty of History</span>
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-bold tracking-tighter text-white leading-[0.9]">
            Preserving Heritage.<br />
            <span className="text-accent-gold italic font-normal">Fractionalising</span> History.
          </h1>
          <p className="text-zinc-300 text-sm md:text-base leading-relaxed max-w-[45ch]">
            Bridge ancient physical museum treasures with Web3 coordinate-mesh provenance for fractional, gasless trading.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <button 
              onClick={() => handleLogin('collector')} 
              className="group inline-flex items-center gap-2 bg-white text-zinc-950 px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-300 hover:bg-zinc-200 hover:scale-[0.98] cursor-pointer shadow-md"
            >
              <span>Enter Collector Vault</span>
              <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" />
            </button>
            <button 
              onClick={() => handleLogin('museum')} 
              className="inline-flex items-center gap-2 border border-white/20 bg-white/10 backdrop-blur-xs px-6 py-3 rounded-full text-xs font-semibold text-white tracking-wider uppercase transition-all hover:bg-white/20 hover:border-accent-gold/50 cursor-pointer"
            >
              <span>Museum Boarding</span>
            </button>
          </div>
          <div className="flex items-center gap-6 border-t border-white/10 pt-8 max-w-md text-[9.5px] font-mono text-zinc-400 tracking-widest uppercase">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[#00E676]" />
              <span>Dual-Chain Anchoring</span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
            <div className="flex items-center gap-1.5">
              <Compass size={14} className="text-accent-gold" />
              <span>Private App-Chain Trading</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: DUAL GATEWAY SHOWCASE (Staggered Column offsets) */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 z-10">
        <div className="text-center space-y-3 mb-16">
          <span className="text-[10px] font-mono text-accent-gold tracking-[0.2em] font-bold uppercase">[ ACCESS_KEYS ]</span>
          <h2 className="text-3xl md:text-4xl font-serif font-medium text-text-primary tracking-tight">
            Security Gateways
          </h2>
          <p className="text-text-secondary text-xs font-mono uppercase tracking-widest">
            Select authentication credentials to enter the marketplace layers
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">

          {/* Gateway 1: The Collector Gateway (Shifted Upwards slightly) */}
          <motion.div
            whileHover={{ y: -6 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="bg-surface border border-border rounded-2xl p-8 flex flex-col justify-between min-h-[380px] hover:border-accent-gold/30 hover:shadow-xl shadow-xs transition-all duration-300 relative overflow-hidden group md:-mt-8"
          >
            <div className="space-y-6 z-10">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-accent-gold tracking-[0.2em] font-bold">[ GATEWAY_COLLECTOR ]</span>
                <Compass size={22} className="text-accent-mint opacity-80 group-hover:scale-110 transition-all" />
              </div>

              <div className="space-y-3">
                <h3 className="text-3xl font-serif font-semibold text-text-primary">
                  Collector Vault
                </h3>
                <p className="text-text-secondary text-xs leading-relaxed max-w-[35ch]">
                  Unlock historical ownership. Acquire coordinates of high-value cultural artifacts, compile complete collections, and trade on our gasless trading network.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleLogin('collector')}
              className="mt-12 w-full py-3 bg-text-primary text-background group-hover:bg-accent-gold group-hover:text-background rounded-full font-semibold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Connect Collector Wallet</span>
              <ArrowRight size={13} />
            </button>
          </motion.div>

          {/* Gateway 2: The Museum Portal (Offset Downwards) */}
          <motion.div
            whileHover={{ y: -6 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="bg-surface border border-border rounded-2xl p-8 flex flex-col justify-between min-h-[380px] hover:border-accent-mint/30 hover:shadow-xl shadow-xs transition-all duration-300 relative overflow-hidden group md:mt-8"
          >
            <div className="space-y-6 z-10">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-accent-gold tracking-[0.2em] font-bold">[ GATEWAY_MUSEUM ]</span>
                <Bank size={22} className="text-accent-gold opacity-80 group-hover:scale-110 transition-all" />
              </div>

              <div className="space-y-3">
                <h3 className="text-3xl font-serif font-semibold text-text-primary">
                  Partner Portal
                </h3>
                <p className="text-text-secondary text-xs leading-relaxed max-w-[35ch]">
                  Establish digital provenance. Tokenise master cultural pieces, manage coordinate fractionalisation grids, and receive secondary royalty streams programmatically.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleLogin('museum')}
              className="mt-12 w-full py-3 border border-border hover:border-accent-gold text-text-primary hover:text-accent-gold rounded-full font-semibold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Enter Institution Portal</span>
              <ArrowRight size={13} />
            </button>
          </motion.div>

        </div>
      </section>

      {/* SECTION 3: MASONRY ARCHIVE ARCHITECTURE (Uneven Spans) */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="space-y-3">
            <span className="text-[10px] font-mono text-accent-gold tracking-[0.2em] font-bold uppercase">[ THE_ARCHIVES ]</span>
            <h2 className="text-3xl md:text-4xl font-serif font-semibold tracking-tight text-text-primary">
              Digitised Assemblages
            </h2>
          </div>
          <p className="text-text-secondary text-xs font-mono uppercase tracking-widest max-w-[35ch]">
            A curated cross-section of cultural items securely anchored using dual-chain cryptographic records
          </p>
        </div>

        {/* Asymmetric Grid Layout inspired by Floria's masonry archives */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 auto-rows-[360px] md:auto-rows-[420px]">

          {/* Card 1: Vietnamese Imperial Lotus (Col-span-8) */}
          <div className="md:col-span-8 border border-border bg-surface rounded-2xl overflow-hidden relative group shadow-xs">
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-10" />

            {/* Thematic Botanical line art overlaid on the back */}
            <Image
              src="/lotus.jpg"
              alt="Lotus"
              fill
              priority
              className="object-cover z-0 transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
              sizes="(max-width: 768px) 100vw, 66vw"
            />

            <div className="absolute inset-x-0 bottom-0 p-8 z-20 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase text-[#D4AF37]">
                <Sparkle size={10} weight="fill" className="animate-pulse" />
                <span>Eastern Collection</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-serif font-bold text-white">
                Lotus
              </h3>

              {/* Card descriptions translate-up and fade-in (Requirement 5) */}
              <div className="overflow-hidden">
                <p className="text-zinc-300 text-xs leading-relaxed max-w-[50ch] translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out">
                  Tokenised into 100 fractional coordinate sectors for historical staking.
                </p>
              </div>
            </div>

            {/* Inset ring shadow instead of default border (Compliance with Floria layout) */}
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[inherit] pointer-events-none z-30" />
          </div>

          {/* Card 2: Renaissance Rose Tapestry (Col-span-4) */}
          <div className="md:col-span-4 border border-border bg-surface rounded-2xl overflow-hidden relative group shadow-xs">
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-10" />

            {/* Thematic Botanical line art */}
            <Image
              src="/renaissance.jpg"
              alt="Renaissance Tapestry"
              fill
              priority
              className="object-cover z-0 transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
              sizes="(max-width: 768px) 100vw, 66vw"
            />

            <div className="absolute inset-x-0 bottom-0 p-8 z-20 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase text-[#00E676]">
                <Sparkle size={10} weight="fill" className="animate-pulse" />
                <span>Western Collection</span>
              </div>
              <h3 className="text-xl md:text-2xl font-serif font-bold text-white">
                Renaissance Rose
              </h3>

              <div className="overflow-hidden">
                <p className="text-zinc-300 text-xs leading-relaxed translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out">
                  A structural vintage tapestry detailing crawling rose stems, preserved digitally under dual-layer provenance.
                </p>
              </div>
            </div>

            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[inherit] pointer-events-none z-30" />
          </div>

        </div>
      </section>

      {/* SECTION 4: STAGGERED TIMELINE DIVISION */}
      <section className="relative max-w-5xl mx-auto px-4 sm:px-6 py-24 z-10">
        <div className="text-center space-y-3 mb-20">
          <span className="text-[10px] font-mono text-accent-gold tracking-[0.2em] font-bold uppercase">[ METHODOLOGY ]</span>
          <h2 className="text-3xl md:text-4xl font-serif font-medium text-text-primary tracking-tight font-serif">
            Chronicle of Fragmentation
          </h2>
          <p className="text-text-secondary text-xs font-mono uppercase tracking-widest">
            How physical museum assets transition onto the dual-chain network
          </p>
        </div>

        {/* Staggered process column matching Floria's process steps */}
        <div className="relative pl-6 md:pl-0 border-l border-border md:border-l-0 md:flex md:flex-col md:items-center space-y-16">

          {/* Vertical timeline line for desktop */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[1px] bg-border/80 z-0" />

          {/* Step 1: Left Aligned */}
          <div className="relative md:grid md:grid-cols-2 md:w-full gap-8 z-10">
            <div className="md:text-right md:pr-12 md:mt-2 space-y-2">
              <span className="text-[10px] font-mono text-accent-gold tracking-widest font-bold">01 / REGISTRATION</span>
              <h4 className="text-xl font-serif font-bold text-text-primary">Authenticity Proof</h4>
              <p className="text-text-secondary text-xs leading-relaxed max-w-[35ch] md:ml-auto">
                Museum officials authenticate the high-res item, generating a master IPFS metadata packet and minting an ERC-721 token on the public anchoring chain.
              </p>
            </div>
            <div className="hidden md:flex items-center pl-12">
              <div className="w-8 h-8 rounded-full border border-accent-gold bg-background flex items-center justify-center -translate-x-[50px] shadow-sm">
                <ShieldCheck size={14} className="text-accent-gold" />
              </div>
            </div>
          </div>

          {/* Step 2: Right Aligned (with horizontal offset) */}
          <div className="relative md:grid md:grid-cols-2 md:w-full gap-8 z-10">
            <div className="hidden md:flex items-center justify-end pr-12">
              <div className="w-8 h-8 rounded-full border border-accent-mint bg-background flex items-center justify-center translate-x-[50px] shadow-sm">
                <Stack size={14} className="text-accent-mint" />
              </div>
            </div>
            <div className="md:pl-12 md:mt-2 space-y-2 text-left">
              <span className="text-[10px] font-mono text-accent-gold tracking-widest font-bold">02 / FRACTIONALISATION</span>
              <h4 className="text-xl font-serif font-bold text-text-primary">Grid Coordinate Splitting</h4>
              <p className="text-text-secondary text-xs leading-relaxed max-w-[35ch]">
                The item is split into a 10x10 grid matrix. Staggered rarity scores are computed dynamically relative to structural canvas focal points.
              </p>
            </div>
          </div>

          {/* Step 3: Left Aligned */}
          <div className="relative md:grid md:grid-cols-2 md:w-full gap-8 z-10">
            <div className="md:text-right md:pr-12 md:mt-2 space-y-2">
              <span className="text-[10px] font-mono text-accent-gold tracking-widest font-bold">03 / TRADING</span>
              <h4 className="text-xl font-serif font-bold text-text-primary">Escrow Listing</h4>
              <p className="text-text-secondary text-xs leading-relaxed max-w-[35ch] md:ml-auto">
                Individual coordinate fragments are minted on the private chain and listed for trading under secure, native smart contract escrows.
              </p>
            </div>
            <div className="hidden md:flex items-center pl-12">
              <div className="w-8 h-8 rounded-full border border-accent-gold bg-background flex items-center justify-center -translate-x-[50px] shadow-sm">
                <Swap size={14} className="text-accent-gold" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 5: MASSIVE EDITORIAL QUOTE */}
      <section className="relative py-28 px-4 sm:px-6 lg:px-8 border-y border-border bg-surface-elevated/20 overflow-hidden z-10">

        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <div className="flex justify-center">
            <Quotes size={48} weight="fill" className="text-accent-gold/30" />
          </div>

          <blockquote className="text-2xl md:text-4xl font-serif italic text-text-primary leading-relaxed font-serif">
            &ldquo;By breaking down immutable masterpieces into coordinate-mapped fragments, we don't dilute their sacred value; we democratise their custody, allowing the world to participate in the physical architecture of natural history.&rdquo;
          </blockquote>
        </div>
      </section>

      {/* SECTION 6: UNIFIED CTAS & FOOTER BACKGROUND VINES */}
      <section className="relative py-32 px-4 sm:px-6 lg:px-8 text-center space-y-8 z-10">

        <div className="space-y-3 max-w-xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-serif font-semibold tracking-tight text-text-primary">
            Acquire a Fragment of History
          </h2>
          <p className="text-text-secondary text-xs md:text-sm leading-relaxed max-w-[38ch] mx-auto">
            Participate in the conservation and custody of the world's most exquisite historical treasures.
          </p>
        </div>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => handleLogin('collector')}
            className="px-8 py-3.5 bg-text-primary text-background dark:bg-text-primary dark:text-background rounded-full font-bold text-xs uppercase tracking-wider transition-transform hover:scale-[0.98] shadow-md cursor-pointer"
          >
            Enter Vault
          </button>
        </div>
      </section>

    </div>
  );
}
