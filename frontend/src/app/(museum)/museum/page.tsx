'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { 
  FolderSimple, 
  Coins, 
  TrendUp, 
  Clock, 
  Spinner,
  ArrowRight,
  Sparkle
} from '@phosphor-icons/react';

const API_BASE = 'http://127.0.0.1:8000';

export default function MuseumDashboard() {
  const router = useRouter();
  const { address } = useAccount();
  const { account: contextAccount } = useWallet();
  const account = address || contextAccount;

  const { data: analytics = { total_endowments_raised: "0", accrued_royalties: "0", total_trades: 0, trading_volume: "0" }, isLoading: analyticsLoading } = useQuery({
    queryKey: ['museumAnalytics', account],
    queryFn: async () => {
      if (!account) return { total_endowments_raised: "0", accrued_royalties: "0", total_trades: 0, trading_volume: "0" };
      const res = await fetch(`${API_BASE}/api/analytics/museum/${account}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    enabled: !!account,
  });

  const { data: museumArtworks = [], isLoading: artworksLoading } = useQuery({
    queryKey: ['museumArtworks', account],
    queryFn: async () => {
      if (!account) return [];
      const res = await fetch(`${API_BASE}/api/artworks`);
      if (!res.ok) throw new Error('Failed to fetch artworks');
      const allArtworks = await res.json();
      return allArtworks.filter(
        (art: any) => art.museum_address.toLowerCase() === account.toLowerCase()
      );
    },
    enabled: !!account,
  });

  const { data: artworkOwnership = {}, isLoading: ownershipLoading } = useQuery({
    queryKey: ['artworkOwnership', museumArtworks, account],
    queryFn: async () => {
      if (!account || !museumArtworks || museumArtworks.length === 0) return {};
      const ownershipInfo: Record<string, { owned: number, total: number, status: string }> = {};
      for (const art of museumArtworks) {
        try {
          const gridRes = await fetch(`${API_BASE}/api/artworks/${art.id}/grid`);
          if (gridRes.ok) {
            const grid = await gridRes.json();
            const total = grid.length || 100;
            const owned = grid.filter(
              (cell: any) => cell.owner_address.toLowerCase() === account.toLowerCase()
            ).length;
            
            let status = "Active";
            if (grid.length === 0) {
              status = "Pending";
            } else if (owned === 0) {
              status = "Sold Out";
            } else {
              status = "Active";
            }
            ownershipInfo[art.id] = { owned, total, status };
          } else {
            ownershipInfo[art.id] = { owned: 0, total: 100, status: "Pending" };
          }
        } catch (err) {
          console.warn(`Error loading grid for ${art.id}:`, err);
          ownershipInfo[art.id] = { owned: 0, total: 100, status: "Pending" };
        }
      }
      return ownershipInfo;
    },
    enabled: !!account && museumArtworks.length > 0,
  });

  const loading = analyticsLoading || artworksLoading || ownershipLoading;

  // Top 3 most recently onboarded artworks (reversed array)
  const recentArtworks = [...museumArtworks].reverse().slice(0, 3);

  return (
    <div className="space-y-10 font-sans">
      {/* Header Section */}
      <div className="border-b border-border pb-4">
        <h1 className="text-4xl font-serif font-medium tracking-tight text-text-primary">
          Museum Catalog Dashboard
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          High-level business telemetry, asset collections, and royalty configurations.
        </p>
      </div>

      {/* Part 1: High-Value Analytics (Important Numbers) */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
          High-Value Analytics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Number of Onboarded Artifacts */}
          <div 
            onClick={() => router.push('/museum/inventory')}
            className="bg-surface p-6 border border-border rounded-2xl space-y-2 cursor-pointer hover:border-accent-gold/30 hover:shadow-xl transition-all duration-300 relative overflow-hidden group shadow-xs"
          >
            <div className="flex justify-between items-center text-text-secondary">
              <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-accent-gold transition-colors">Onboarded Artifacts</span>
              <FolderSimple size={16} className="group-hover:text-accent-gold group-hover:scale-110 transition-all" />
            </div>
            <div className="text-2xl font-mono font-bold text-text-primary">
              {loading ? <Spinner size={16} className="animate-spin" /> : museumArtworks.length}
            </div>
            <p className="text-[9px] text-text-secondary leading-none">Click to view full inventory</p>
          </div>

          {/* Card 2: Accrued Royalty Balance */}
          <div 
            onClick={() => router.push('/museum/ledger')}
            className="bg-surface p-6 border border-border rounded-2xl space-y-2 cursor-pointer hover:border-accent-gold/30 hover:shadow-xl transition-all duration-300 group shadow-xs"
          >
            <div className="flex justify-between items-center text-text-secondary">
              <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-accent-gold transition-colors">Accrued Royalties</span>
              <Coins size={16} className="group-hover:text-accent-gold group-hover:scale-110 transition-all" />
            </div>
            <div className="text-2xl font-mono font-bold text-text-primary">
              {parseFloat(ethers.formatEther(analytics.accrued_royalties)).toFixed(4)} ETH
            </div>
            <p className="text-[9px] text-text-secondary leading-none">Click to view royalty ledger</p>
          </div>

          {/* Card 3: Total Trades Count */}
          <div className="bg-surface p-6 border border-border rounded-2xl space-y-2 hover:border-border/80 transition-all duration-300 group shadow-xs">
            <div className="flex justify-between items-center text-text-secondary">
              <span className="text-[10px] font-bold uppercase tracking-wider">Total Trades</span>
              <Clock size={16} className="group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-2xl font-mono font-bold text-text-primary">
              {analytics.total_trades} {analytics.total_trades === 1 ? 'Trade' : 'Trades'}
            </div>
            <p className="text-[9px] text-text-secondary leading-none">On-chain confirmed transfers</p>
          </div>

          {/* Card 4: Trading Volume */}
          <div className="bg-surface p-6 border border-border rounded-2xl space-y-2 hover:border-border/80 transition-all duration-300 group shadow-xs">
            <div className="flex justify-between items-center text-text-secondary">
              <span className="text-[10px] font-bold uppercase tracking-wider">Trading Volume</span>
              <TrendUp size={16} className="text-accent-mint group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-2xl font-mono font-bold text-text-primary">
              {parseFloat(ethers.formatEther(analytics.trading_volume)).toFixed(4)} ETH
            </div>
            <p className="text-[9px] text-text-secondary leading-none">Aggregated secondary sales</p>
          </div>
        </div>
      </section>

      {/* Part 2: Asset Inventory Summary */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
            Asset Inventory Summary
          </h2>
          <button 
            onClick={() => router.push('/museum/inventory')}
            className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-accent-gold hover:text-accent-gold/80 transition-colors cursor-pointer"
          >
            <span>View All Assets</span>
            <ArrowRight size={10} />
          </button>
        </div>

        <div 
          onClick={() => router.push('/museum/inventory')}
          className="bg-surface p-6 border border-border rounded-2xl hover:border-accent-gold/25 transition-all duration-300 cursor-pointer space-y-6 shadow-xs"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Spinner size={20} className="text-accent-gold animate-spin" />
              <span className="text-[10px] text-text-secondary font-mono">Loading summary...</span>
            </div>
          ) : recentArtworks.length === 0 ? (
            <div className="text-center py-6 text-xs text-text-secondary">
              No digitized assets yet. Go to <span className="text-accent-gold font-bold underline">Onboard Artifact</span> to split and mint your first piece.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentArtworks.map((art) => {
                const info = artworkOwnership[art.id] || { owned: 0, total: 100, status: 'Pending' };
                return (
                  <div 
                    key={art.id}
                    className="bg-background rounded-2xl border border-border overflow-hidden hover:border-accent-gold/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col group/card"
                  >
                    {/* Small Image Preview */}
                    <div className="relative h-32 bg-surface-elevated overflow-hidden border-b border-border">
                      <img 
                        src={`${API_BASE}${art.image_url}`} 
                        alt={art.title} 
                        className="w-full h-full object-cover group-hover/card:scale-[1.02] transition-transform duration-500" 
                      />
                      <div className="absolute top-2 right-2">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase tracking-wider bg-background/90 backdrop-blur-sm border ${
                          info.status === 'Sold Out' 
                            ? 'border-red-500/20 text-red-500'
                            : info.status === 'Pending'
                            ? 'border-accent-gold/20 text-accent-gold'
                            : 'border-accent-mint/20 text-accent-mint'
                        }`}>
                          {info.status}
                        </span>
                      </div>
                    </div>
                    {/* Summary Info */}
                    <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="font-serif font-bold text-text-primary text-sm truncate group-hover/card:text-accent-gold transition-colors">
                          {art.title}
                        </h4>
                        <p className="text-[9px] text-text-secondary mt-0.5 truncate">
                          {art.artist} &bull; {art.creation_year}
                        </p>
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-mono text-text-secondary pt-2 border-t border-border/40">
                        <span>Fragments:</span>
                        <span className="font-bold text-accent-gold">{info.total} Cells</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
