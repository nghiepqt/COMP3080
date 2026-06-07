'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWallet } from '@/app/context/wallet-context';
import { motion } from 'framer-motion';
import { 
  PuzzlePiece, 
  CircleNotch,
  ArrowRight
} from '@phosphor-icons/react';

const API_BASE = 'http://127.0.0.1:8000';

interface Artwork {
  id: string;
  title: string;
  artist: string;
  creation_year: number;
  master_token_id: string | null;
  public_chain_tx_hash: string | null;
  master_ipfs_hash: string;
  museum_address: string;
  image_url: string;
}

interface FragmentCell {
  id: string;
  token_id: number;
  coord_x: number;
  coord_y: number;
  rarity_score: number;
  owner_address: string;
  status: string;
}

interface ArtworkCollection {
  artwork: Artwork;
  ownedFragments: FragmentCell[];
  totalFragments: number;
  completenessPercent: number;
}

export default function CollectorPuzzleBook() {
  const { account } = useWallet();
  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState<ArtworkCollection[]>([]);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});

  // Aspect ratio loading
  useEffect(() => {
    collection.forEach(({ artwork }) => {
      if (!aspectRatios[artwork.id]) {
        const img = new Image();
        img.src = `${API_BASE}${artwork.image_url}`;
        img.onload = () => {
          if (img.naturalWidth && img.naturalHeight) {
            setAspectRatios((prev) => ({
              ...prev,
              [artwork.id]: img.naturalWidth / img.naturalHeight,
            }));
          }
        };
      }
    });
  }, [collection, aspectRatios]);

  // Load collector data when account changes
  useEffect(() => {
    if (account) {
      loadCollectorData();
    } else {
      setLoading(false);
      setCollection([]);
    }
  }, [account]);

  const loadCollectorData = async () => {
    setLoading(true);
    try {
      const artRes = await fetch(`${API_BASE}/api/artworks`);
      if (!artRes.ok) throw new Error('Failed to load artworks');
      const artworks: Artwork[] = await artRes.json();

      const userCollections: ArtworkCollection[] = [];

      for (const art of artworks) {
        const gridRes = await fetch(`${API_BASE}/api/artworks/${art.id}/grid`);
        if (gridRes.ok) {
          const grid: FragmentCell[] = await gridRes.json();
          const owned = grid.filter(
            (cell) => cell.owner_address.toLowerCase() === account?.toLowerCase()
          );

          if (owned.length > 0) {
            userCollections.push({
              artwork: art,
              ownedFragments: owned,
              totalFragments: grid.length || 100,
              completenessPercent: Math.round((owned.length / (grid.length || 100)) * 100),
            });
          }
        }
      }

      setCollection(userCollections);
    } catch (e) {
      console.error('Error loading collector puzzle data:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center space-y-6 font-sans">
        <div className="w-16 h-16 bg-surface rounded-lg flex items-center justify-center mx-auto border border-border shadow-sm">
          <PuzzlePiece size={28} className="text-accent-gold" />
        </div>
        <div className="space-y-3">
          <h1 className="text-5xl font-serif font-medium text-text-primary">Collector Hub</h1>
          <p className="text-text-secondary text-xs max-w-sm mx-auto leading-relaxed">
            Connect your wallet or toggle Developer Wallet Mode in the top header to view your collected fragments, active bids, and portfolio analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <CircleNotch size={24} className="text-accent-gold animate-spin" />
          <span className="text-xs text-text-secondary font-mono">Assembling portfolio metrics...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Header Section */}
          <div className="border-b border-border pb-4 mb-2">
            <h1 className="text-4xl font-serif font-medium tracking-tight text-text-primary">
              Collector Hub
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Assemble your puzzle book, view completed heritage monuments, and track coordinate sector completeness.
            </p>
          </div>
          {collection.length === 0 ? (
            <div className="bg-surface p-16 rounded border border-border text-center space-y-5 max-w-2xl mx-auto">
              <div className="w-14 h-14 bg-background rounded-full flex items-center justify-center mx-auto border border-border">
                <PuzzlePiece size={24} className="text-text-secondary/50" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-lg font-medium text-text-primary">No collected fragments yet</h3>
                <p className="text-text-secondary text-xs max-w-md mx-auto leading-relaxed">
                  Explore the marketplace catalog, lock escrow bids, or purchase coordinate sectors to start building your heritage book.
                </p>
              </div>
              <Link
                href="/collector/marketplace"
                className="inline-flex items-center gap-1.5 bg-text-primary text-background hover:opacity-90 px-5 py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-all"
              >
                <span>Explore Marketplace</span>
                <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
              {collection.map(({ artwork, ownedFragments, totalFragments, completenessPercent }, idx) => (
                <motion.div 
                  key={artwork.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="bg-surface p-6 rounded border border-border flex flex-col md:flex-row gap-8 items-center hover:border-accent-gold/45 hover:shadow-lg hover:shadow-accent-gold/[0.01] transition-all duration-300"
                >
                  {/* Left: Grayscale puzzle board overlay */}
                  <div 
                    className="relative w-64 bg-background rounded border border-border overflow-hidden flex-shrink-0 shadow-sm"
                    style={{ aspectRatio: aspectRatios[artwork.id] || 1 }}
                  >
                    <img
                      src={`${API_BASE}${artwork.image_url}`}
                      alt={artwork.title}
                      className="absolute inset-0 w-full h-full object-cover filter grayscale blur-[0.5px] opacity-15"
                    />
                    <div 
                      className="absolute inset-1 grid grid-cols-10 gap-[1.5px] w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)]"
                      style={{ gridTemplateRows: 'repeat(10, minmax(0, 1fr))' }}
                    >
                      {Array.from({ length: 100 }).map((_, i) => {
                        const tokenId = i + 1;
                        const isOwned = ownedFragments.some((cell) => (cell.coord_y * 10 + cell.coord_x + 1) === tokenId);
                        const col = i % 10;
                        const row = Math.floor(i / 10);
                        const bgPosX = col * 11.111;
                        const bgPosY = row * 11.111;

                        return (
                          <div
                            key={tokenId}
                            className={`relative rounded-[0.5px] w-full h-full transition-all duration-300 overflow-hidden ${
                              isOwned
                                ? 'ring-[0.5px] ring-accent-gold bg-transparent'
                                : 'bg-black/90 dark:bg-black/95'
                            }`}
                            style={isOwned ? {
                              backgroundImage: `url(${API_BASE}${artwork.image_url})`,
                              backgroundSize: '1000% 1000%',
                              backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                            } : undefined}
                          >
                            {isOwned && (
                              <div className="absolute inset-0 bg-accent-gold/5 pointer-events-none" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Side: Collection Parameters */}
                  <div className="flex-grow space-y-5 w-full flex flex-col justify-between h-full md:h-64">
                    <div className="space-y-2">
                      <span className="text-[9px] uppercase tracking-widest text-accent-gold font-bold block">
                        Monumental Provenance
                      </span>
                      <h3 className="text-xl font-serif font-bold text-text-primary leading-tight">
                        {artwork.title}
                      </h3>
                      <p className="text-xs text-text-secondary">
                        by <span className="font-semibold text-text-primary">{artwork.artist}</span> &bull; {artwork.creation_year}
                      </p>
                    </div>

                    <div className="space-y-3 bg-background border border-border p-4 rounded">
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-[10px] text-text-secondary uppercase tracking-wider font-bold">Completeness</span>
                        <span className="text-accent-gold font-mono font-bold">{ownedFragments.length} / {totalFragments} Sectors</span>
                      </div>
                      
                      <div className="w-full bg-text-secondary/10 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-accent-gold to-accent-mint rounded-full transition-all duration-500"
                          style={{ width: `${completenessPercent}%` }}
                        />
                      </div>
                      
                      <p className="text-[10px] text-text-secondary leading-none">
                        You own <span className="font-bold text-text-primary">{completenessPercent}%</span> of this artifact.
                      </p>
                    </div>

                    <Link
                      href={`/artwork/${artwork.id}`}
                      className="w-full py-2.5 rounded border border-border hover:bg-surface-elevated text-center text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Trade Console</span>
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
