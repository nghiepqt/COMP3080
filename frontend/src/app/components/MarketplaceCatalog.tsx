'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ethers } from 'ethers';
import { 
  Coins, 
  MagnifyingGlass, 
  ArrowUpRight,
  Sparkle,
  CircleNotch,
  FolderOpen
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { API_BASE } from '@/config/env';
import { truncateAddress } from '@/lib/utils';

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

interface ListingItem {
  listing_id: string;
  fragment_id: string;
  token_id: number;
  coord_x: number;
  coord_y: number;
  rarity_score: number;
  price: string; // in Wei
  seller: string;
  artwork_title: string;
}

function formatAddress(addr: string) {
  if (addr.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266') {
    return 'National Heritage Museum';
  }
  return truncateAddress(addr);
}

/** Dynamically resolve the artwork detail base path from the current route context */
function useArtworkBasePath(): string {
  const pathname = usePathname();
  if (pathname.startsWith('/museum')) return '/museum/artwork';
  if (pathname.startsWith('/collector')) return '/collector/artwork';
  return '/artwork'; // fallback for public context
}

export default function MarketplaceCatalog() {
  const artworkBasePath = useArtworkBasePath();

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [tradedCounts, setTradedCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMarketplaceData();
  }, []);

  const loadMarketplaceData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Artworks
      const artRes = await fetch(`${API_BASE}/api/artworks`);
      if (!artRes.ok) throw new Error('Failed to load artworks');
      const artData: Artwork[] = await artRes.json();
      setArtworks(artData);

      // 2. Fetch active listings
      const listRes = await fetch(`${API_BASE}/api/listings`);
      if (listRes.ok) {
        const listData = await listRes.json();
        setListings(listData);
      }

      // 3. Fetch traded counts for each artwork by loading grids
      const counts: Record<string, number> = {};
      await Promise.all(
        artData.map(async (art) => {
          try {
            const gridRes = await fetch(`${API_BASE}/api/artworks/${art.id}/grid`);
            if (gridRes.ok) {
              const grid = await gridRes.json();
              // A fragment is traded if its owner is not the museum address
              const traded = grid.filter(
                (cell: any) => cell.owner_address.toLowerCase() !== art.museum_address.toLowerCase()
              ).length;
              counts[art.id] = traded;
            } else {
              counts[art.id] = 0;
            }
          } catch (e) {
            console.error(`Error loading grid for artwork ${art.id}:`, e);
            counts[art.id] = 0;
          }
        })
      );
      setTradedCounts(counts);

    } catch (e) {
      console.error('Error fetching marketplace data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Compute floor prices
  const floorPrices: Record<string, number | null> = {};
  artworks.forEach((art) => {
    floorPrices[art.id] = null;
  });

  listings.forEach((listing) => {
    const artId = listing.fragment_id.substring(0, listing.fragment_id.lastIndexOf('_'));
    const priceEth = parseFloat(ethers.formatEther(listing.price));
    const currentFloor = floorPrices[artId];
    if (currentFloor === null || priceEth < currentFloor) {
      floorPrices[artId] = priceEth;
    }
  });

  const filteredArtworks = artworks.filter((art) => {
    return (
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.museum_address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-8 font-sans">
      {/* Title Header */}
      <div className="space-y-2 border-b border-border pb-6">
        <h1 className="text-3xl font-serif font-medium text-text-primary tracking-tight">
          Master Collection Catalog
        </h1>
        <p className="text-sm text-text-secondary max-w-2xl">
          Browse certified historical monuments digitized as fractionated coordinates. Click any artwork gallery card to view its interactive heatmap matrix and trade fragments gaslessly.
        </p>
      </div>

      {/* Filter / Search Bar */}
      <div className="border border-border bg-surface p-4 rounded-lg flex flex-col md:flex-row gap-4 items-center justify-between transition-colors duration-300">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            placeholder="Search by title, artist, or museum address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-md px-10 py-2.5 text-xs focus:border-accent-gold focus:outline-none focus:ring-1 focus:ring-accent-gold/25 transition-all text-text-primary"
          />
        </div>
        
        <div className="text-[10px] text-text-secondary uppercase font-mono tracking-widest">
          {filteredArtworks.length} Collections Active
        </div>
      </div>

      {/* Main Grid Catalog */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <CircleNotch size={32} className="text-accent-gold animate-spin" />
          <span className="text-xs text-text-secondary font-mono">Loading Heritage Assets...</span>
        </div>
      ) : filteredArtworks.length === 0 ? (
        <div className="bg-surface p-20 rounded-lg border border-border text-center text-text-secondary space-y-4 max-w-2xl mx-auto shadow-xs">
          <FolderOpen size={40} className="text-text-secondary/40 mx-auto" />
          <div>
            <p className="text-base font-serif font-semibold text-text-primary">No Collections Found</p>
            <p className="text-xs max-w-xs mx-auto text-text-secondary mt-1">
              Try adjusting your search keywords or check back later for newly digitized historical assets.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredArtworks.map((art, idx) => {
            const floorPrice = floorPrices[art.id];
            const tradedCount = tradedCounts[art.id] || 0;
            const artworkImageUrl = `${API_BASE}${art.image_url}`;

            return (
              <motion.div
                key={art.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: Math.min(idx * 0.08, 0.4) }}
                className="group relative flex flex-col bg-surface border border-border rounded-lg overflow-hidden transition-all duration-500 hover:border-accent-gold/40 hover:shadow-[0_4px_25px_rgba(179,143,57,0.08)]"
              >
                {/* Visual Asset Container */}
                <div className="relative h-64 overflow-hidden bg-surface-elevated">
                  <img
                    src={artworkImageUrl}
                    alt={art.title}
                    className="object-cover w-full h-full transform transition-transform duration-700 group-hover:scale-105"
                  />
                  {/* Floor Price Tag Frosted Glass Overlay */}
                  <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-md border border-border px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 z-10 transition-colors">
                    {floorPrice !== null ? (
                      <>
                        <Coins size={12} className="text-accent-mint" />
                        <span className="text-xs font-mono font-bold text-accent-mint">
                          Floor: {floorPrice.toFixed(3)} ETH
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-text-secondary">
                        Idle / Minting
                      </span>
                    )}
                  </div>
                </div>

                {/* Details Section */}
                <div className="p-6 flex-grow flex flex-col justify-between gap-6">
                  <div className="space-y-2">
                    <span className="text-[9px] uppercase tracking-widest text-text-secondary font-bold block">
                      {formatAddress(art.museum_address)}
                    </span>
                    <h3 className="font-serif font-bold text-text-primary text-xl leading-snug group-hover:text-accent-gold transition-colors duration-300">
                      {art.title}
                      <span className="font-sans font-normal text-xs text-text-secondary ml-1.5">
                        ({art.creation_year})
                      </span>
                    </h3>
                    <p className="text-xs text-text-secondary">
                      by <span className="font-medium text-text-primary">{art.artist}</span>
                    </p>
                  </div>

                  {/* Scarcity Saturation Tracker */}
                  <div className="space-y-2 border-t border-border pt-4">
                    <div className="flex justify-between items-center text-[10px] font-mono text-text-secondary">
                      <span>Market Saturation</span>
                      <span className="font-bold text-text-primary">{tradedCount}% Traded</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-elevated border border-border/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent-gold to-accent-mint rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${tradedCount}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-text-secondary font-sans">
                      <span>Traded: {tradedCount} / 100 Fragments</span>
                      {art.master_token_id && (
                        <span className="flex items-center gap-0.5 text-accent-gold">
                          <Sparkle size={10} weight="fill" />
                          <span>Master Anchor #{art.master_token_id}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Trade Action Link — uses dynamic base path */}
                  <div>
                    <Link
                      href={`${artworkBasePath}/${art.id}`}
                      className="w-full py-2.5 rounded bg-text-primary text-background hover:bg-text-primary/90 text-xs font-semibold text-center uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Explore Collection</span>
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
