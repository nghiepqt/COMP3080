'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown, ArrowsClockwise } from '@phosphor-icons/react';

interface NetworkOption {
  id: number;
  name: string;
  dotColor: string;
  pingColor: string;
}

const NETWORKS: NetworkOption[] = [
  { id: 9999, name: 'Anvil Private', dotColor: 'bg-accent-mint', pingColor: 'bg-accent-mint/75' },
  { id: 31338, name: 'Anvil Public', dotColor: 'bg-accent-gold', pingColor: 'bg-accent-gold/75' },
  { id: 80002, name: 'Amoy Testnet', dotColor: 'bg-purple-500', pingColor: 'bg-purple-500/75' }
];

export default function DevNetworkToggle() {
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isConnected) return null;

  const activeNetwork = NETWORKS.find(n => n.id === chainId) || {
    id: chainId || 0,
    name: `Unknown (${chainId})`,
    dotColor: 'bg-red-500',
    pingColor: 'bg-red-500/75'
  };

  const handleSelect = (networkId: number) => {
    if (networkId === chainId) {
      setIsOpen(false);
      return;
    }
    switchChain({ chainId: networkId });
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-border bg-surface hover:bg-surface-elevated transition-all duration-200 text-[10px] font-semibold tracking-wider uppercase select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm min-w-[150px] justify-between"
      >
        <span className="flex items-center gap-2">
          {/* Network indicator dot */}
          <span className="relative flex h-2 w-2">
            {isPending ? (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-text-secondary animate-pulse"></span>
            ) : (
              <>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${activeNetwork.pingColor} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${activeNetwork.dotColor}`}></span>
              </>
            )}
          </span>

          {/* Network label */}
          <span className="text-text-secondary font-mono tracking-normal normal-case">
            {isPending ? 'Switching...' : activeNetwork.name}
          </span>
        </span>

        {isPending ? (
          <ArrowsClockwise size={12} className="text-text-secondary animate-spin" />
        ) : (
          <CaretDown size={12} className={`text-text-secondary opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 z-[100] mt-2 w-48 rounded-lg border border-border/80 bg-surface/95 backdrop-blur-md shadow-xl overflow-hidden focus:outline-none"
          >
            <div className="py-1" role="menu" aria-orientation="vertical">
              {NETWORKS.map((network) => {
                const isSelected = network.id === chainId;
                return (
                  <button
                    key={network.id}
                    onClick={() => handleSelect(network.id)}
                    className={`flex items-center justify-between w-full text-left px-4 py-2.5 text-[11px] font-mono text-text-primary hover:bg-surface-elevated/80 transition-colors duration-150 cursor-pointer ${
                      isSelected ? 'bg-surface-elevated font-semibold' : ''
                    }`}
                    role="menuitem"
                  >
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${network.dotColor}`}></span>
                      </span>
                      <span>{network.name}</span>
                    </span>
                    
                    {isSelected && (
                      <span className="text-[9px] text-accent-gold uppercase tracking-wider font-sans font-bold">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
