'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import DevNetworkToggle from '@/components/DevNetworkToggle';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SquaresFour, 
  Storefront, 
  FolderSimple, 
  Coins, 
  CloudArrowUp,
  Warning
} from '@phosphor-icons/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { truncateAddress } from '@/lib/utils';
import AuthLoadingPortal from '@/components/AuthLoadingPortal';

export default function MuseumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { account, activeRole, isInitialized, authStatus } = useWallet();
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

  // Redirect non-museum to /collector
  useEffect(() => {
    if (activeRole && activeRole !== 'museum') {
      router.push('/collector');
    }
  }, [activeRole, router]);

  const navItems = [
    { href: '/museum', label: 'Catalog Home', icon: SquaresFour },
    { href: '/museum/marketplace', label: 'Marketplace', icon: Storefront },
    { href: '/museum/inventory', label: 'Asset Inventory', icon: FolderSimple },
    { href: '/museum/ledger', label: 'Royalty Ledger', icon: Coins },
    { href: '/museum/onboard', label: 'Onboard Artifact', icon: CloudArrowUp },
  ];

  const isActive = (href: string) => {
    if (href === '/museum') {
      return pathname === '/museum';
    }
    // Keep Marketplace highlighted when browsing an artwork detail
    if (href === '/museum/marketplace') {
      return pathname.startsWith('/museum/marketplace') || pathname.startsWith('/museum/artwork');
    }
    return pathname.startsWith(href);
  };



  // Block dashboard layout structure and sidebar loading during auth verification
  if (!isInitialized || authStatus !== 'AUTHENTICATED' || !account) {
    return (
      <AuthLoadingPortal
        authStatus={authStatus}
        isInitialized={isInitialized}
      />
    );
  }

  if (activeRole !== 'museum') {
    return (
      <div className="p-4 rounded border border-red-500/20 bg-red-500/10 text-red-500 text-xs flex items-center gap-2 font-medium">
        <Warning size={16} />
        <span>
          Museum Partner role is required to access this panel.
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-darkBg text-gallery-darkTextPrimary font-sans">
      
      {/* 1. FULL-HEIGHT FIXED SIDEBAR */}
      <aside className="w-64 h-full border-r border-gallery-borderData bg-gallery-darkSurface flex flex-col flex-shrink-0">
        {/* Logo / Branding Area */}
        <div className="h-16 flex items-center px-6 border-b border-gallery-borderData">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/museum_dashboard.png" alt="Museum Logo" className="h-16 w-auto object-contain" />
          </Link>
        </div>
        {/* Navigation Links Area */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded text-xs font-semibold tracking-wide uppercase transition-all ${
                  active
                    ? 'bg-accent-gold/10 text-accent-gold border-l-2 border-accent-gold pl-2'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40 pl-3'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 2. MAIN CONTENT WRAPPER (Takes remaining width) */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top Header (Only spans the remaining width) */}
        <header className="h-16 shrink-0 flex items-center justify-end px-8 border-b border-gallery-borderData bg-gallery-darkBg gap-4">
          
          {/* Theme Toggle */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <ThemeToggle className="p-2 rounded" />
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
        <main className="flex-grow overflow-y-auto p-8 bg-gallery-darkBg">
          {children}
        </main>
      </div>

    </div>
  );
}
