'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import DevNetworkToggle from '@/components/DevNetworkToggle';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChartPie, 
  Storefront, 
  PuzzlePiece,
  Warning,
  Sun,
  Moon,
  ArrowsLeftRight,
  Compass,
  CircleNotch
} from '@phosphor-icons/react';
import AuthLoadingPortal from '@/components/AuthLoadingPortal';

export default function CollectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { account, activeRole, isInitialized, authStatus } = useWallet();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (isInitialized && !account) {
      router.push('/');
    }
  }, [isInitialized, account, router]);

  // Redirect admin to /museum
  useEffect(() => {
    if (activeRole === 'admin') {
      router.push('/museum');
    }
  }, [activeRole, router]);

  const navItems = [
    { href: '/collector', label: 'Portfolio', icon: ChartPie },
    { href: '/collector/marketplace', label: 'Marketplace', icon: Storefront },
    { href: '/collector/puzzle-book', label: 'Puzzle Book', icon: PuzzlePiece },
  ];

  const isActive = (href: string) => {
    if (href === '/collector') {
      return pathname === '/collector';
    }
    // Keep Marketplace highlighted when browsing an artwork detail
    if (href === '/collector/marketplace') {
      return pathname.startsWith('/collector/marketplace') || pathname.startsWith('/collector/artwork');
    }
    return pathname.startsWith(href);
  };

  const truncateAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const currentTheme = theme === 'system' && mounted ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;

  // Block dashboard layout structure and sidebar loading during auth verification
  if (!isInitialized || authStatus !== 'AUTHENTICATED' || !account) {
    return (
      <AuthLoadingPortal
        authStatus={authStatus}
        isInitialized={isInitialized}
      />
    );
  }

  if (activeRole === 'admin') {
    return (
      <div className="p-4 rounded border border-red-500/20 bg-red-500/10 text-red-500 text-xs flex items-center gap-2 font-medium">
        <Warning size={16} />
        <span>
          Access Denied. Redirecting to Museum Panel...
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-text-primary font-sans">
      
      {/* 1. COMPACT VERTICAL MICRO-SIDEBAR (optimized for minimum width) */}
      <aside className="w-20 h-full border-r border-border bg-surface flex flex-col flex-shrink-0">
        
        {/* Branding placeholder at top boundary */}
        <div className="h-16 flex items-center justify-center border-b border-border">
          <Link href="/" className="flex items-center justify-center p-2 rounded hover:bg-surface-elevated/40 transition-colors">
            <img src="/collector_dashboard.ico" alt="Collector Logo" className="w-8 h-8 object-contain" />
          </Link>
        </div>

        {/* Stacked Button Grid arranged vertically */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-1 select-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center justify-center w-full py-4 aspect-square transition-all group cursor-pointer ${
                  active 
                    ? 'text-accent-gold bg-accent-gold/5' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/35'
                }`}
              >
                {/* Active Indicator Left gold bar */}
                {active && (
                  <motion.span
                    layoutId="collectorSidebarActiveLine"
                    className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-gold"
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  />
                )}
                
                <Icon size={20} className="transition-transform group-hover:scale-105" />
                
                <span className="text-[9px] font-semibold tracking-wider uppercase mt-1.5 text-center px-1 font-sans">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom padding / metadata */}
        <div className="pb-4 border-t border-border/40 text-center py-2">
          <span className="text-[8px] font-sans text-text-secondary">COLL</span>
        </div>
      </aside>

      {/* 2. MAIN GALLERY VIEWPORT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        
        {/* Minimal Sub-header at upper edge */}
        <header className="h-16 shrink-0 flex items-center justify-end px-8 border-b border-border bg-surface gap-4">
          
          {/* Theme Toggle */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {mounted && (
                <motion.button
                  key={currentTheme}
                  onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
                  initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="p-2 rounded hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  aria-label="Toggle theme"
                >
                  {currentTheme === 'dark' ? (
                    <Sun size={15} weight="duotone" />
                  ) : (
                    <Moon size={15} weight="duotone" />
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Dev-Mode Network Switcher */}
          <DevNetworkToggle />

          {/* Wallet Status */}
          {account ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded border border-border bg-surface text-xs text-text-primary">
              <span className="font-mono text-[11px] text-text-secondary">{truncateAddress(account)}</span>
            </div>
          ) : (
            <button
              onClick={() => alert('Please connect your wallet via MetaMask.')}
              className="bg-text-primary text-background text-xs uppercase tracking-wider font-semibold px-4 py-1.5 rounded hover:opacity-90 transition-opacity"
            >
              Connect
            </button>
          )}

        </header>

        {/* Scrollable Page Content */}
        <main className="flex-grow overflow-y-auto p-8 bg-background">
          {children}
        </main>
      </div>

    </div>
  );
}
