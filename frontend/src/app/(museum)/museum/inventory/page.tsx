'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/app/context/wallet-context';
import { useAccount } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spinner, FolderSimple, CloudArrowUp, ArrowRight, Trash } from '@phosphor-icons/react';
import { API_BASE } from '@/config/env';

export default function MuseumInventory() {
  const router = useRouter();
  const { address } = useAccount();
  const { account: contextAccount } = useWallet();
  const account = address || contextAccount;
  const queryClient = useQueryClient();

  const { data: museumArtworks = [], isLoading: artworksLoading } = useQuery({
    queryKey: ['museumArtworks', account],
    queryFn: async () => {
      if (!account) return [];
      const res = await fetch(`${API_BASE}/api/artworks?t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to load artworks");
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
        if (art.status === 'FAILED') {
          ownershipInfo[art.id] = { owned: 0, total: 100, status: "Failed" };
          continue;
        }
        try {
          const gridRes = await fetch(`${API_BASE}/api/artworks/${art.id}/grid?t=${Date.now()}`);
          if (gridRes.ok) {
            const grid = await gridRes.json();
            const total = grid.length || 100;
            const owned = grid.filter(
              (cell: any) => cell.owner_address.toLowerCase() === account.toLowerCase()
            ).length;
            
            let status = "Active";
            if (art.status === 'PENDING') {
              status = "Pending";
            } else if (grid.length === 0) {
              status = "Pending";
            } else if (owned === 0) {
              status = "Sold Out";
            } else {
              status = "Active";
            }
            ownershipInfo[art.id] = { owned, total, status };
          } else {
            ownershipInfo[art.id] = { owned: 0, total: 100, status: art.status === 'PENDING' ? "Pending" : "Active" };
          }
        } catch (err) {
          console.warn(`Error loading grid for ${art.id}:`, err);
          ownershipInfo[art.id] = { owned: 0, total: 100, status: art.status === 'PENDING' ? "Pending" : "Active" };
        }
      }
      return ownershipInfo;
    },
    enabled: !!account && museumArtworks.length > 0,
  });

  const loadingInventory = artworksLoading || ownershipLoading;

  const handleDeleteArtwork = async (artId: string, artTitle: string) => {
    if (!confirm(`Are you sure you want to delete the failed entry "${artTitle}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/artworks/${artId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['museumArtworks'] });
      } else {
        alert("Failed to delete artwork entry.");
      }
    } catch (err) {
      console.error("Error deleting artwork:", err);
      alert("Error deleting artwork.");
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-text-primary">Digitized Asset Inventory</h1>
          <p className="text-xs text-text-secondary">Track and manage your digitized physical artworks on-chain.</p>
        </div>
        <button
          onClick={() => router.push('/museum/onboard')}
          className="px-4 py-2 bg-text-primary text-background hover:opacity-90 rounded text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <CloudArrowUp size={14} />
          <span>Onboard Artifact</span>
        </button>
      </div>

      {loadingInventory ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner size={24} className="text-accent-gold animate-spin" />
          <span className="text-xs text-text-secondary font-mono">Loading assets...</span>
        </div>
      ) : museumArtworks.length === 0 ? (
        <div className="bg-surface p-16 rounded border border-border text-center space-y-5 max-w-2xl mx-auto">
          <div className="w-14 h-14 bg-background rounded-full flex items-center justify-center mx-auto border border-border">
            <FolderSimple size={24} className="text-text-secondary/50" />
          </div>
          <div className="space-y-2">
            <h3 className="font-serif text-lg font-medium text-text-primary">No digitized assets</h3>
            <p className="text-text-secondary text-xs max-w-md mx-auto leading-relaxed">
              You haven't onboarded any physical artifacts from this museum account yet. Mint your first master heritage piece to configure fragment coordinate divisions.
            </p>
          </div>
          <button
            onClick={() => router.push('/museum/onboard')}
            className="inline-flex items-center gap-1.5 bg-text-primary text-background hover:opacity-90 px-5 py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
          >
            <span>Onboard First Artifact</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {museumArtworks.map((art: any) => {
            const info = artworkOwnership[art.id] || { owned: 0, total: 100, status: 'Pending' };
            return (
              <div 
                key={art.id} 
                className="bg-surface rounded-lg border border-border overflow-hidden hover:border-accent-gold/45 hover:shadow-lg hover:shadow-accent-gold/[0.02] transition-all duration-300 flex flex-col group"
              >
                {/* Image Header */}
                <div className="relative h-48 bg-surface-elevated overflow-hidden border-b border-border">
                  <img 
                    src={`${API_BASE}${art.image_url}`} 
                    alt={art.title} 
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" 
                  />
                  <div className="absolute top-3 right-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-background/90 backdrop-blur-sm border ${
                      info.status === 'Sold Out' 
                        ? 'border-red-500/30 text-red-500'
                        : info.status === 'Pending'
                        ? 'border-accent-gold/30 text-accent-gold'
                        : info.status === 'Failed'
                        ? 'border-red-500/50 text-red-500 bg-red-500/10'
                        : 'border-accent-mint/30 text-accent-mint'
                    }`}>
                      {info.status}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-mono text-text-secondary border border-border">
                    Token: #{art.master_token_id || 'Pending'}
                  </div>
                </div>

                {/* Content Body */}
                <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <h3 className="font-serif font-bold text-text-primary text-base leading-tight group-hover:text-accent-gold transition-colors">
                      {art.title}
                    </h3>
                    <p className="text-[10px] text-text-secondary">
                      by <span className="font-semibold text-text-primary">{art.artist}</span> &bull; {art.creation_year}
                    </p>
                  </div>

                  {/* Ownership Split */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="flex justify-between text-[10px] font-mono text-text-secondary">
                      <span>Vault:</span>
                      <span className="font-bold text-accent-gold">{info.owned} / {info.total} Fragments</span>
                    </div>
                    <div className="w-full bg-text-secondary/15 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-accent-gold h-full rounded-full transition-all duration-300"
                        style={{ width: `${(info.owned / info.total) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Action Link / Delete Button */}
                  <div className="pt-2 flex justify-between items-center w-full">
                    {info.status === 'Failed' ? (
                      <button
                        onClick={() => handleDeleteArtwork(art.id, art.title)}
                        className="inline-flex items-center gap-1.5 text-[10px] uppercase font-bold text-red-500 hover:opacity-85 transition-opacity cursor-pointer border border-red-500/25 bg-red-500/5 px-2.5 py-1 rounded"
                      >
                        <Trash size={11} />
                        <span>Delete Failed</span>
                      </button>
                    ) : info.status === 'Pending' ? (
                      <span className="text-[10px] font-mono text-text-secondary uppercase">Syncing matrix...</span>
                    ) : (
                      <Link 
                        href={`/museum/artwork/${art.id}`}
                        className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-bold text-accent-gold hover:opacity-85 transition-opacity"
                      >
                        <span>Trade Console</span>
                        <ArrowRight size={10} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
