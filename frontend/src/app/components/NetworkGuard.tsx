'use client';

import React from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { Warning, ArrowClockwise } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

export default function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  // Allow local Anvil nodes (31338 and 9999) and Amoy Testnet (80002)
  const isWrongChain = isConnected && chainId !== 80002 && chainId !== 31338 && chainId !== 9999;

  if (isWrongChain) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="max-w-md w-full border border-border/80 bg-surface/90 rounded-xl p-8 shadow-2xl text-center space-y-6 relative overflow-hidden"
        >
          {/* Top subtle gold glow */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-accent-gold" />
          
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-accent-gold/10 text-accent-gold">
              <Warning size={32} weight="fill" className="animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-serif font-bold text-text-primary tracking-tight">
              Incorrect Network Detected
            </h2>
            <p className="text-text-secondary text-xs leading-relaxed max-w-xs mx-auto">
              iHeritage operates exclusively on the **Local Anvil** networks or the **Amoy Testnet**. Please switch your network to continue.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => switchChain({ chainId: 9999 })}
              disabled={isPending}
              className="w-full py-3 border border-border hover:border-accent-mint text-text-primary hover:text-accent-mint font-semibold text-xs uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <ArrowClockwise size={14} className="animate-spin" />
              ) : null}
              <span>Switch to Local Trading (9999)</span>
            </button>

            <button
              onClick={() => switchChain({ chainId: 31338 })}
              disabled={isPending}
              className="w-full py-3 border border-border hover:border-accent-gold text-text-primary hover:text-accent-gold font-semibold text-xs uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <ArrowClockwise size={14} className="animate-spin" />
              ) : null}
              <span>Switch to Public Anchor (31338)</span>
            </button>
            
            <button
              onClick={() => switchChain({ chainId: 80002 })}
              disabled={isPending}
              className="w-full py-3 bg-text-primary text-background font-semibold text-xs uppercase tracking-wider rounded hover:bg-accent-gold hover:text-background transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <ArrowClockwise size={14} className="animate-spin" />
              ) : null}
              <span>Switch to Amoy Testnet</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
