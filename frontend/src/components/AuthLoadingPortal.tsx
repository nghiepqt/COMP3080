'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AuthStatus } from '@/app/context/wallet-context';

interface AuthLoadingPortalProps {
  authStatus: AuthStatus;
  isInitialized: boolean;
  redirecting?: boolean;
}

export default function AuthLoadingPortal({
  authStatus,
  isInitialized,
  redirecting = false,
}: AuthLoadingPortalProps) {
  
  // Resolve status text based on active Web3 operation
  const getStatusDetails = () => {
    if (!isInitialized) {
      return {
        title: 'Provenance Gateway',
        subtitle: 'Initializing Gateway Connection...',
        description: 'Restoring secure cryptographic providers and verifying system state.'
      };
    }
    
    if (redirecting || authStatus === 'AUTHENTICATED') {
      return {
        title: 'Access Granted',
        subtitle: 'Syncing Provenance Ledger...',
        description: 'Authorization verified. Decrypting secure dashboard state.'
      };
    }

    switch (authStatus) {
      case 'CONNECTING_WALLET':
        return {
          title: 'Gateway Security',
          subtitle: 'Connecting Web3 Wallet...',
          description: 'Awaiting network handshake from your wallet provider.'
        };
      case 'CONNECTED_UNAUTH':
        return {
          title: 'Gateway Connected',
          subtitle: 'Establishing Session...',
          description: 'Connection established. Requesting cryptographic token payload.'
        };
      case 'FETCHING_NONCE':
        return {
          title: 'Secure Handshake',
          subtitle: 'Retrieving Session Nonce...',
          description: 'Requesting a unique cryptographic token from the iHeritage backend.'
        };
      case 'SIGNING_MESSAGE':
        return {
          title: 'Identity Proof',
          subtitle: 'Awaiting Signature...',
          description: 'Please sign the secure nonce in your wallet to verify ownership.'
        };
      case 'VERIFYING_SIGNATURE':
        return {
          title: 'Verification',
          subtitle: 'Validating Authenticity...',
          description: 'Broadcasting signature proof to public nodes for session approval.'
        };
      case 'FAILED':
        return {
          title: 'Access Denied',
          subtitle: 'Handshake Failed',
          description: 'The cryptographic challenge signature could not be verified.'
        };
      default:
        return {
          title: 'Provenance Gateway',
          subtitle: 'Securing Portal Connection...',
          description: 'Securing active dual-chain pathways.'
        };
    }
  };

  const { title, subtitle, description } = getStatusDetails();

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 font-sans bg-background text-text-primary">
      {/* Mesh grid background decoration matching main page aesthetics */}
      <div className="absolute inset-0 pointer-events-none opacity-5 border-x border-border max-w-7xl mx-auto grid grid-cols-12 z-0">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="border-r border-border h-full" />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full border border-border bg-surface/90 backdrop-blur-md rounded-2xl p-8 shadow-2xl space-y-8 text-center relative overflow-hidden z-10"
      >
        {/* Shimmering Gold Accent Bar */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-accent-gold overflow-hidden">
          <motion.div
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: 'linear',
            }}
            className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent"
          />
        </div>

        {/* Dynamic Breathing Gold Seal / Compass Ornament */}
        <div className="flex justify-center">
          <div className="relative p-6 rounded-full border border-accent-gold/25 bg-accent-gold/5 flex items-center justify-center">
            {/* Pulsing Outer Ring */}
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                repeat: Infinity,
                duration: 3,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 rounded-full border border-accent-gold/40"
            />
            {/* Pulsing Inner Solid Ring */}
            <motion.div
              animate={{
                scale: [0.95, 1.05, 0.95],
              }}
              transition={{
                repeat: Infinity,
                duration: 3,
                ease: 'easeInOut',
                delay: 0.5,
              }}
              className="absolute inset-2 rounded-full border border-accent-gold/60"
            />
            {/* Stylized Core Web3 Emblem */}
            <svg
              className="w-10 h-10 text-accent-gold"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
              <line x1="12" y1="22" x2="12" y2="15.5" />
              <polyline points="22 8.5 12 15.5 2 8.5" />
              <polyline points="2 15.5 12 8.5 22 15.5" />
              <line x1="12" y1="2" x2="12" y2="8.5" />
            </svg>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent-gold font-bold">
            [ {title} ]
          </div>
          <h2 className="text-xl font-serif font-bold tracking-tight text-text-primary transition-all">
            {subtitle}
          </h2>
          <p className="text-text-secondary text-xs leading-relaxed max-w-[32ch] mx-auto min-h-[36px]">
            {description}
          </p>
        </div>

        {/* Indication that standard secure procedures are executing */}
        <div className="border-t border-border/60 pt-5 flex items-center justify-center gap-4 text-[9px] font-mono text-text-secondary tracking-widest uppercase">
          <span className="flex h-1.5 w-1.5 rounded-full bg-accent-gold animate-pulse" />
          <span>Dual-Chain Vault Link</span>
        </div>
      </motion.div>
    </div>
  );
}
