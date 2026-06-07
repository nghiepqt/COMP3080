'use client';

import React, { useState } from 'react';
import { useWallet } from '@/app/context/wallet-context';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { API_BASE } from '@/config/env';
import { truncateAddress } from '@/lib/utils';
import {
  Coins,
  TrendUp,
  Receipt,
  Clock,
  Spinner
} from '@phosphor-icons/react';

export default function RoyaltyLedger() {
  const { address } = useAccount();
  const { account: contextAccount } = useWallet();
  const account = address || contextAccount;

  const [claimingRoyalties, setClaimingRoyalties] = useState(false);

  const { data: analytics, isLoading: loading } = useQuery({
    queryKey: ['museumAnalytics', account],
    queryFn: async () => {
      if (!account) return null;
      const res = await fetch(`${API_BASE}/api/analytics/museum/${account}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    enabled: !!account,
  });

  const formatEth = (weiStr: string) => {
    try {
      return parseFloat(ethers.formatEther(weiStr || "0")).toFixed(4);
    } catch (e) {
      return "0.0000";
    }
  };

  const handleClaimRoyalties = async () => {
    setClaimingRoyalties(true);
    try {
      // Simulate/Show notification
      await new Promise((resolve) => setTimeout(resolve, 1500));
      alert("Creator royalties are distributed instantly on-chain directly to your vault address upon purchase completion! No manual withdrawal is needed.");
    } catch (e) {
      console.error(e);
    } finally {
      setClaimingRoyalties(false);
    }
  };

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <span className="text-sm text-text-secondary font-mono">Please connect your wallet to view the royalty ledger.</span>
      </div>
    );
  }

  if (loading || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <Spinner size={24} className="text-accent-gold animate-spin" />
        <span className="text-xs text-text-secondary font-mono">Loading ledger analytics...</span>
      </div>
    );
  }

  const accruedRoyalties = parseFloat(ethers.formatEther(analytics.accrued_royalties || "0"));
  const totalVolume = parseFloat(ethers.formatEther(analytics.trading_volume || "0"));
  const totalTrades = analytics.total_trades || 0;

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-serif font-semibold text-text-primary">Royalty Ledger</h1>
        <p className="text-xs text-text-secondary">Track secondary trading activity and claim accrued creator royalties.</p>
      </div>

      {/* Stats Cards (4 Cols) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface p-5 border border-border rounded-lg space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-text-secondary">
              <span className="text-[10px] font-bold uppercase tracking-wider">Accrued Royalties</span>
              <Coins size={16} className="text-accent-gold" />
            </div>
            <div className="text-2xl font-mono font-bold text-text-primary">
              {accruedRoyalties.toFixed(4)} ETH
            </div>
            <p className="text-[9px] text-text-secondary leading-none">7% creator royalty enabled</p>
          </div>
          {accruedRoyalties > 0 && (
            <button
              onClick={handleClaimRoyalties}
              disabled={claimingRoyalties}
              className="w-full py-1.5 bg-accent-gold hover:opacity-90 disabled:opacity-50 text-background text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              {claimingRoyalties ? (
                <>
                  <Spinner size={10} className="animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <span>Check Royalty Info</span>
              )}
            </button>
          )}
        </div>

        <div className="bg-surface p-5 border border-border rounded-lg space-y-2">
          <div className="flex justify-between items-center text-text-secondary">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Volume</span>
            <TrendUp size={16} className="text-accent-mint" />
          </div>
          <div className="text-2xl font-mono font-bold text-text-primary">
            {totalVolume.toFixed(4)} ETH
          </div>
          <p className="text-[9px] text-text-secondary leading-none">Aggregated secondary sales</p>
        </div>

        <div className="bg-surface p-5 border border-border rounded-lg space-y-2">
          <div className="flex justify-between items-center text-text-secondary">
            <span className="text-[10px] font-bold uppercase tracking-wider">Royalty Split</span>
            <Receipt size={16} className="text-text-secondary" />
          </div>
          <div className="text-2xl font-mono font-bold text-text-primary">7.00 %</div>
          <p className="text-[9px] text-text-secondary leading-none">Fixed public registry parameter</p>
        </div>

        <div className="bg-surface p-5 border border-border rounded-lg space-y-2">
          <div className="flex justify-between items-center text-text-secondary">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Trades</span>
            <Clock size={16} className="text-text-secondary" />
          </div>
          <div className="text-2xl font-mono font-bold text-text-primary">
            {totalTrades} {totalTrades === 1 ? 'Trade' : 'Trades'}
          </div>
          <p className="text-[9px] text-text-secondary leading-none">On-chain confirmed transfers</p>
        </div>
      </div>

      {/* Payout Details & Ledger Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Ledger Table (8 Cols) */}
        <div className="lg:col-span-8 bg-surface p-6 border border-border rounded-lg space-y-4">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-widest border-b border-border pb-3 flex items-center gap-1.5">
            <Clock size={14} />
            <span>On-chain Royalty Ledger</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-[9px] uppercase tracking-widest text-text-secondary font-bold">
                  <th className="py-2.5">Fragment</th>
                  <th className="py-2.5">Buyer</th>
                  <th className="py-2.5">Seller</th>
                  <th className="py-2.5">Sale Price</th>
                  <th className="py-2.5 text-right">Royalty (7%)</th>
                </tr>
              </thead>
              <tbody className="text-[11px] font-mono divide-y divide-border">
                {analytics.transactions && analytics.transactions.length > 0 ? (
                  analytics.transactions.map((tx: any) => (
                    <tr key={tx.id}>
                      <td className="py-3 text-text-primary font-sans font-semibold">{tx.fragment_name}</td>
                      <td className="py-3 text-text-secondary" title={tx.buyer}>{truncateAddress(tx.buyer)}</td>
                      <td className="py-3 text-text-secondary" title={tx.seller}>{truncateAddress(tx.seller)}</td>
                      <td className="py-3 text-text-primary">{formatEth(tx.price)} ETH</td>
                      <td className="py-3 text-right text-accent-gold font-bold">{formatEth(tx.museum_royalty)} ETH</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-secondary font-sans text-xs">
                      No royalty-accruing secondary trades found for your artworks yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Royalty Parameters (4 Cols) */}
        <div className="lg:col-span-4 bg-surface p-6 border border-border rounded-lg space-y-4">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-widest border-b border-border pb-3 flex items-center gap-1.5">
            <Receipt size={14} />
            <span>Settlement Config</span>
          </h3>

          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Receiving Vault</p>
              <p className="font-mono text-[10px] text-text-primary bg-background border border-border p-2.5 rounded truncate select-all">
                {account}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Settlement Model</p>
              <p className="text-text-primary font-medium leading-relaxed">
                Instant Automated Escrow. Royalties are deducted directly in the smart contract functions and forwarded immediately to the vault address.
              </p>
            </div>

            <div className="border-t border-border pt-4 text-[10px] text-text-secondary leading-relaxed">
              Royalty split settings are immutable after contract initialization to secure trust boundaries for secondary market participants.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
