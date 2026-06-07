'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import { useTxLifecycle } from '@/hooks/useTxLifecycle';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Tag,
  Coins,
  ShieldCheck,
  Gavel,
  CircleNotch,
  Sparkle,
  Lock,
  X,
  ArrowUpRight,
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
  fragment_ipfs_hash: string;
  owner_address: string;
  status: 'IDLE' | 'LISTED' | 'SOLD';
  price: string | null;
  bids_count: number;
  is_reserved: boolean;
}

interface BidInfo {
  id: string;
  bidder: string;
  amount: string;
}

interface FragmentDetailResponse {
  id: string;
  artwork_id: string;
  token_id: number;
  coord_x: number;
  coord_y: number;
  rarity_score: number;
  fragment_ipfs_hash: string;
  owner_address: string;
  is_reserved: boolean;
  listing: {
    id: string;
    price: string;
    seller: string;
  } | null;
  bids: BidInfo[];
}

function getRarityLabel(score: number) {
  if (score >= 85) return 'Legendary';
  if (score >= 50) return 'Rare';
  return 'Common';
}

function getRarityBadgeBg(score: number) {
  if (score >= 85) return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 dark:border-cyan-400/30';
  if (score >= 50) return 'bg-accent-gold/15 text-accent-gold border border-accent-gold/25';
  return 'bg-background text-text-secondary border border-border';
}

// Custom Premium Flower Icons for State Overlay
const ListedFlowerIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={`${className} stroke-emerald-200`}
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 9.5c0-2.5 1.5-4 3-4s3 1.5 3 3c0 2-2.5 3-6 3" />
    <path d="M12 12c-2.5 0-4-1.5-4-3s1.5-3 3-3c2 0 3 2.5 3 6" />
    <path d="M12 12c0 2.5-1.5 4-3 4s-3-1.5-3-3c0-2 2.5-3 6-3" />
    <path d="M12 12c2.5 0 4 1.5 4 3s-1.5 3-3 3c-2 0-3-2.5-3-6" />
  </svg>
);

const SoldFlowerIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={`${className} stroke-rose-200`}
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 9.5c0-3.5-3.5-3.5-3.5 0s3.5 3.5 3.5 0z" />
    <path d="M12 14.5c0 3.5 3.5 3.5 3.5 0s-3.5-3.5-3.5 0z" />
    <path d="M9.5 12c-3.5 0-3.5 3.5 0 3.5s3.5-3.5 0-3.5z" />
    <path d="M14.5 12c3.5 0 3.5-3.5 0-3.5s-3.5 3.5 0 3.5z" />
    <path d="M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" strokeDasharray="2 3" opacity="0.5" />
  </svg>
);

/** Resolve the back-navigation href from the current pathname at runtime */
function useBackHref(): { href: string; label: string } {
  const pathname = usePathname();
  if (pathname.startsWith('/collector')) {
    return { href: '/collector/marketplace', label: 'Marketplace' };
  }
  if (pathname.startsWith('/museum')) {
    return { href: '/museum/marketplace', label: 'Marketplace' };
  }
  return { href: '/', label: 'Catalog' };
}

export default function ArtworkDetail({ artworkId }: { artworkId: string }) {
  const { account, contracts, getPrivateSigner } = useWallet();
  const { txStep, txHash, errorMsg, executeTx, reset: resetTx } = useTxLifecycle();
  const back = useBackHref();

  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [grid, setGrid] = useState<FragmentCell[]>([]);
  const [selectedCell, setSelectedCell] = useState<FragmentCell | null>(null);
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);
  const [cellDetails, setCellDetails] = useState<FragmentDetailResponse | null>(null);

  // Form states
  const [listPrice, setListPrice] = useState('');
  const [bidAmount, setBidAmount] = useState('');

  // Tab & subtab switcher state
  const [activeTab, setActiveTab] = useState<'heatmap' | 'analytics'>('heatmap');
  const [subTab, setSubTab] = useState<'listings' | 'bids'>('listings');
  const [artworkBids, setArtworkBids] = useState<any[]>([]);

  const [rawHistory, setRawHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Art-First view toggle (ON = Market Analysis Mode, OFF = Default Art Mode)
  const [isMarketAnalysisMode, setIsMarketAnalysisMode] = useState(false);

  const fetchArtworkData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/artworks/${artworkId}?t=${Date.now()}`);
      if (res.ok) setArtwork(await res.json());
    } catch (e) {
      console.error('Error fetching artwork details:', e);
    }
  }, [artworkId]);

  const fetchGridData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/artworks/${artworkId}/grid?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setGrid(data);
        setSelectedCell(prev => {
          if (!prev) return null;
          const updated = data.find((c: FragmentCell) => c.id === prev.id);
          if (!updated) return prev;
          if (
            updated.owner_address !== prev.owner_address ||
            updated.status !== prev.status ||
            updated.price !== prev.price ||
            updated.bids_count !== prev.bids_count ||
            updated.is_reserved !== prev.is_reserved
          ) {
            return updated;
          }
          return prev;
        });
      }
    } catch (e) {
      console.error('Error fetching grid details:', e);
    }
  }, [artworkId]);

  const fetchRawHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/artwork/${artworkId}/price-history?raw=true&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        // Sort newest first for raw transactional log feed
        const sorted = data.sort((a: any, b: any) => b.timestamp - a.timestamp);
        setRawHistory(sorted);
      }
    } catch (e) {
      console.error('Error fetching raw price history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [artworkId]);

  const fetchArtworkBids = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bids/artwork/${artworkId}?t=${Date.now()}`);
      if (res.ok) {
        setArtworkBids(await res.json());
      }
    } catch (e) {
      console.error('Error fetching artwork active bids:', e);
    }
  }, [artworkId]);

  const fetchCellDetails = useCallback(async (fragId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/fragments/${fragId}?t=${Date.now()}`);
      if (res.ok) setCellDetails(await res.json());
    } catch (e) {
      console.error('Error fetching fragment details:', e);
    }
  }, []);

  const reloadAllStates = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchArtworkData(),
        fetchGridData(),
        fetchRawHistory(),
        fetchArtworkBids(),
        selectedCell ? fetchCellDetails(selectedCell.id) : Promise.resolve()
      ]);
    } catch (e) {
      console.error('Error reloading all states:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [artworkId, fetchArtworkData, fetchGridData, fetchRawHistory, fetchArtworkBids, fetchCellDetails, selectedCell]);

  // Reactive trigger to pull updates after Web3 actions (handles indexer latency)
  const triggerReactiveRefresh = useCallback(() => {
    fetchGridData();
    fetchRawHistory();
    fetchArtworkBids();
    setTimeout(() => {
      fetchGridData();
      fetchRawHistory();
      fetchArtworkBids();
    }, 1000);
    setTimeout(() => {
      fetchGridData();
      fetchRawHistory();
      fetchArtworkBids();
    }, 2500);
    setTimeout(() => {
      fetchGridData();
      fetchRawHistory();
      fetchArtworkBids();
    }, 5000);
  }, [fetchGridData, fetchRawHistory, fetchArtworkBids]);

  useEffect(() => {
    fetchArtworkData();
    fetchGridData();
    fetchRawHistory();
    fetchArtworkBids();
  }, [artworkId, fetchArtworkData, fetchGridData, fetchRawHistory, fetchArtworkBids]);

  useEffect(() => {
    if (selectedCell) {
      fetchCellDetails(selectedCell.id);
    } else {
      setCellDetails(null);
    }
  }, [selectedCell, fetchCellDetails]);

  const selectedCellRef = React.useRef(selectedCell);
  useEffect(() => {
    selectedCellRef.current = selectedCell;
  }, [selectedCell]);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    let eventSource: EventSource | null = null;
    let timeoutId: any = null;

    const connectSSE = () => {
      if (retryCount >= maxRetries) {
        console.error('SSE connection failed after maximum retries. Real-time updates disabled.');
        return;
      }

      console.log(`Subscribing to SSE for Artwork ID: ${artworkId}, attempt ${retryCount + 1}`);
      eventSource = new EventSource(`http://127.0.0.1:8000/api/artworks/${artworkId}/stream`);

      eventSource.onopen = () => {
        retryCount = 0; // Reset retries on successful connection
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('SSE Event in Artwork Detail:', data);

          if (data.artwork_id === artworkId) {
            fetchGridData();
            fetchRawHistory();
            fetchArtworkBids();
            const currentSelected = selectedCellRef.current;
            if (currentSelected) {
              fetchCellDetails(currentSelected.id);
            }
          }
        } catch (err) {
          console.error('Error parsing SSE in artwork detail:', err);
        }
      };

      eventSource.onerror = (e) => {
        console.warn('SSE connection error in artwork detail. Cleaning up connection...');
        if (eventSource) {
          eventSource.close();
        }
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
        timeoutId = setTimeout(connectSSE, delay);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [artworkId, fetchGridData, fetchRawHistory, fetchArtworkBids, fetchCellDetails]);

  const handleListFragment = async () => {
    if (!selectedCell || !listPrice || !contracts) return;
    try {
      await executeTx(
        async () => {
          const signer = await getPrivateSigner();
          if (!signer) throw new Error('Private chain wallet not connected. Please ensure MetaMask is connected.');
          const marketplaceContract = new ethers.Contract(contracts.FragmentMarketplace.address, contracts.FragmentMarketplace.abi, signer);
          const priceInWei = ethers.parseEther(listPrice);
          return await marketplaceContract.listFragment(selectedCell.token_id, priceInWei);
        },
        async () => {
          setListPrice('');
          triggerReactiveRefresh();
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleBuyFragment = async () => {
    if (!selectedCell || !selectedCell.price || !contracts) return;
    try {
      await executeTx(
        async () => {
          const signer = await getPrivateSigner();
          if (!signer) throw new Error('Wallet not connected.');
          const marketplaceContract = new ethers.Contract(contracts.FragmentMarketplace.address, contracts.FragmentMarketplace.abi, signer);
          const priceWei = BigInt(selectedCell.price || '0');
          const platformCut = (priceWei * BigInt(500)) / BigInt(10000);
          const valueToSend = priceWei + platformCut;
          return await marketplaceContract.buyFragment(selectedCell.token_id, { value: valueToSend });
        },
        async () => {
          triggerReactiveRefresh();
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlaceBid = async () => {
    if (!selectedCell || !bidAmount || !contracts) return;
    try {
      await executeTx(
        async () => {
          const signer = await getPrivateSigner();
          if (!signer) throw new Error('Wallet not connected.');
          const marketplaceContract = new ethers.Contract(contracts.FragmentMarketplace.address, contracts.FragmentMarketplace.abi, signer);
          const amountWei = ethers.parseEther(bidAmount);

          const currentOwner = cellDetails
            ? (cellDetails.listing ? cellDetails.listing.seller : cellDetails.owner_address)
            : selectedCell.owner_address;

          const isPrimary = artwork && currentOwner
            ? currentOwner.toLowerCase() === artwork.museum_address.toLowerCase()
            : true;

          const valueToSend = isPrimary
            ? amountWei
            : amountWei + (amountWei * BigInt(500)) / BigInt(10000);

          return await marketplaceContract.placeBid(selectedCell.token_id, { value: valueToSend });
        },
        async () => {
          setBidAmount('');
          triggerReactiveRefresh();
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    if (!contracts) return;
    try {
      await executeTx(
        async () => {
          const signer = await getPrivateSigner();
          if (!signer) throw new Error('Wallet not connected.');
          const marketplaceContract = new ethers.Contract(contracts.FragmentMarketplace.address, contracts.FragmentMarketplace.abi, signer);
          return await marketplaceContract.acceptBid(bidId);
        },
        async () => {
          triggerReactiveRefresh();
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

  const artworkImageUrl = artwork ? `${API_BASE}${artwork.image_url}` : '';

  const [aspectRatio, setAspectRatio] = useState<number>(1);

  useEffect(() => {
    if (artworkImageUrl) {
      const img = new Image();
      img.src = artworkImageUrl;
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          setAspectRatio(img.naturalWidth / img.naturalHeight);
        }
      };
    }
  }, [artworkImageUrl]);

  // Compute hovered cell slice
  const hoveredCell = grid.find((c) => c.id === hoveredCellId);

  return (
    <div className="space-y-6 font-sans pb-4">
      <div className="flex justify-between items-center w-full">
        {/* Dynamic back navigation */}
        <Link
          href={back.href}
          className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors uppercase tracking-wider font-semibold"
        >
          <ArrowLeft size={12} />
          <span>{back.label}</span>
        </Link>

        {/* Manual Refresh Button */}
        <button
          onClick={reloadAllStates}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface text-[10px] font-semibold text-text-secondary hover:text-text-primary hover:border-accent-gold/45 transition-colors uppercase tracking-wider font-mono cursor-pointer disabled:opacity-50"
        >
          <CircleNotch size={12} className={isRefreshing ? "animate-spin text-accent-gold" : "text-text-secondary"} />
          <span>{isRefreshing ? "Refreshing..." : "Refresh State"}</span>
        </button>
      </div>

      {artwork && (
        <>
          {/* Artwork Header */}
          <header className="space-y-2 border-b border-border pb-6">
            <div className="flex items-center gap-3 flex-wrap">
              {artwork.public_chain_tx_hash && (
                <span className="inline-flex items-center gap-1.5 text-[10px] text-accent-mint uppercase tracking-wider font-bold">
                  <ShieldCheck size={13} weight="fill" />
                  <span>Provenance Verified</span>
                </span>
              )}
              {artwork.master_token_id && (
                <span className="text-[10px] text-text-secondary font-mono bg-surface-elevated border border-border px-2 py-0.5 rounded">
                  Public Anchor Token: #{artwork.master_token_id}
                </span>
              )}
            </div>
            <h1 className="text-5xl md:text-7xl font-serif font-medium tracking-tight text-text-primary leading-tight">
              {artwork.title}
            </h1>
            <p className="text-xs text-text-secondary">
              by <span className="font-semibold text-text-primary">{artwork.artist}</span> &bull; {artwork.creation_year}
            </p>
          </header>

          {/* Responsive 2-Tab Sub-Navigation Switcher */}
          <div className="flex border-b border-border gap-6 pt-2 pb-1">
            <button
              onClick={() => setActiveTab('heatmap')}
              className={`relative pb-2.5 text-xs uppercase tracking-wider font-bold transition-colors duration-300 cursor-pointer ${activeTab === 'heatmap' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              Fragments
              {activeTab === 'heatmap' && (
                <motion.span
                  layoutId="activeTabLine"
                  className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-gold"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`relative pb-2.5 text-xs uppercase tracking-wider font-bold transition-colors duration-300 cursor-pointer ${activeTab === 'analytics' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
            >
              Market Activity
              {activeTab === 'analytics' && (
                <motion.span
                  layoutId="activeTabLine"
                  className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-gold"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          </div>

          {activeTab === 'heatmap' && (
            /* Main Content Grid */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
              {/* Left: Interactive Grid Map (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-3 flex-wrap gap-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-primary">
                    Coordinate Fragment Map
                  </span>

                  <div className="flex items-center gap-6">
                    {/* Legend - Only show if Market Analysis Mode is ON */}
                    {isMarketAnalysisMode && (
                      <div className="flex gap-4 text-[9px] uppercase tracking-wider font-bold text-text-secondary transition-opacity duration-300">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded bg-black/25 border border-border" />
                          <span>Idle</span>
                        </div>
                        <div className="flex items-center gap-1 text-emerald-400">
                          <ListedFlowerIcon className="w-4 h-4" />
                          <span>Listed</span>
                        </div>
                        <div className="flex items-center gap-1 text-rose-400">
                          <SoldFlowerIcon className="w-4 h-4" />
                          <span>Sold</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-400">
                          <Lock size={12} weight="fill" />
                          <span>Reserved</span>
                        </div>
                      </div>
                    )}

                    {/* Art-First Market Toggle */}
                    <div className="flex items-center gap-2 bg-surface border border-border rounded-full py-1 px-3 shadow-xs">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-text-secondary">
                        Market State
                      </span>
                      <button
                        onClick={() => setIsMarketAnalysisMode(!isMarketAnalysisMode)}
                        className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isMarketAnalysisMode ? 'bg-accent-gold' : 'bg-surface-elevated border-border'
                          }`}
                        aria-label="Toggle Market State Analysis"
                      >
                        <span
                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isMarketAnalysisMode ? 'translate-x-3.5' : 'translate-x-0'
                            }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Grid Area */}
                {grid.length === 0 ? (
                  <div className="aspect-square flex flex-col items-center justify-center gap-3 bg-surface border border-border rounded">
                    <CircleNotch size={24} className="text-accent-gold animate-spin" />
                    <span className="text-xs text-text-secondary font-mono">Loading grid matrix...</span>
                  </div>
                ) : (
                  <div
                    className="relative w-full max-w-[540px] mx-auto overflow-hidden border border-border bg-surface shadow-sm"
                    style={{ aspectRatio }}
                  >
                    <div
                      className="absolute inset-0 grid grid-cols-10 w-full h-full"
                      style={{ gridTemplateRows: 'repeat(10, minmax(0, 1fr))' }}
                    >
                      {grid.map((cell) => {
                        const isSelected = selectedCell?.id === cell.id;
                        const isHovered = hoveredCellId === cell.id;
                        const isLegendary = cell.rarity_score >= 85;
                        const isRare = cell.rarity_score >= 50 && cell.rarity_score < 85;

                        const col = cell.coord_x;
                        const row = cell.coord_y;
                        const bgPosX = col * 11.111;
                        const bgPosY = row * 11.111;

                        let borderClass = '';
                        if (isSelected) {
                          borderClass = 'border-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.6)]';
                        } else if (isHovered) {
                          borderClass = 'border border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]';
                        } else if (isMarketAnalysisMode) {
                          if (isLegendary) {
                            borderClass = 'border border-cyan-200/90 shadow-[0_0_12px_rgba(167,243,254,0.6)]';
                          } else if (isRare) {
                            borderClass = 'border border-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.4)]';
                          } else {
                            borderClass = 'border-[0.5px] border-grid-line';
                          }
                        } else {
                          borderClass = 'border-none';
                        }

                        let zIndexValue = 10;
                        if (isSelected || isHovered) {
                          zIndexValue = 40;
                        } else if (isMarketAnalysisMode) {
                          if (isLegendary) zIndexValue = 30;
                          else if (isRare) zIndexValue = 20;
                        }

                        return (
                          <div key={cell.id} className="relative w-full h-full">
                            <motion.button
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedCell(null);
                                } else {
                                  setSelectedCell(cell);
                                }
                              }}
                              onMouseEnter={() => setHoveredCellId(cell.id)}
                              onMouseLeave={() => setHoveredCellId(null)}
                              animate={{
                                scale: isSelected ? 1.25 : isHovered ? 1.15 : 1,
                              }}
                              transition={{
                                type: 'spring',
                                stiffness: 220,
                                damping: 18,
                                delay: !isSelected && isHovered ? 0.5 : 0
                              }}
                              aria-label={`Fragment ${cell.token_id}, ${getRarityLabel(cell.rarity_score)}, ${cell.status}`}
                              className={`
                                relative w-full h-full cursor-pointer outline-none transition-[border-color,box-shadow] duration-200 glint-effect
                                ${borderClass}
                              `}
                              style={{
                                zIndex: zIndexValue,
                              }}
                            >
                              {/* Unified absolute wrapper container */}
                              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                {/* Background Image Layer */}
                                <div
                                  className="absolute inset-0 bg-no-repeat"
                                  style={{
                                    backgroundImage: `url(${artworkImageUrl})`,
                                    backgroundSize: '1000% 1000%',
                                    backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                                  }}
                                />

                                {/* Legendary Shimmer Layer */}
                                {isMarketAnalysisMode && isLegendary && (
                                  <div className="absolute inset-0 legendary-shimmer pointer-events-none z-10" />
                                )}

                                {/* Translucent color overlays and state SVG vectors */}
                                {isMarketAnalysisMode ? (
                                  <>
                                    {cell.is_reserved ? (
                                      <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center pointer-events-none z-20">
                                        <Lock className="w-6 h-6 text-amber-300 animate-pulse" weight="fill" />
                                      </div>
                                    ) : cell.status === 'LISTED' ? (
                                      <div className="absolute inset-0 bg-emerald-500/50 flex items-center justify-center pointer-events-none z-20">
                                        <ListedFlowerIcon className="w-8 h-8" />
                                      </div>
                                    ) : cell.status === 'SOLD' ? (
                                      <div className="absolute inset-0 bg-rose-500/50 flex items-center justify-center pointer-events-none z-20">
                                        <SoldFlowerIcon className="w-8 h-8" />
                                      </div>
                                    ) : (
                                      <div className="absolute inset-0 bg-black/25 pointer-events-none z-20" />
                                    )}
                                  </>
                                ) : (
                                  cell.is_reserved && (isHovered || isSelected) && (
                                    <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center pointer-events-none z-20">
                                      <Lock className="w-5 h-5 text-amber-300" weight="fill" />
                                    </div>
                                  )
                                )}
                              </div>
                            </motion.button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Detailed Sidebar Panel (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                {/* Block 1: Current Selected Fragment (Persistent) */}
                <div className="bg-surface border border-border rounded-lg p-5 space-y-6">
                  <div className="flex justify-between items-center border-b border-border pb-3">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-accent-gold" />
                      Selected Fragment
                    </h2>
                    {selectedCell && (
                      <button
                        onClick={() => setSelectedCell(null)}
                        className="text-text-secondary hover:text-text-primary cursor-pointer transition-colors p-1"
                        aria-label="Clear selection"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {!selectedCell ? (
                    <div className="text-center py-12 text-xs text-text-secondary leading-relaxed font-sans flex flex-col items-center justify-center space-y-3">
                      <div className="p-2.5 bg-surface-elevated rounded-full border border-border">
                        <Sparkle size={18} className="text-accent-gold animate-pulse" />
                      </div>
                      <p className="max-w-[280px]">
                        Click any coordinate segment in the map catalog to lock selection and access Web3 escrow operations.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Details */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-2xl font-serif font-bold text-text-primary flex items-center gap-1.5">
                            Fragment #{selectedCell.token_id}
                            {selectedCell.rarity_score >= 85 && (
                              <Sparkle size={16} weight="fill" className="text-cyan-500 dark:text-cyan-400" />
                            )}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase tracking-wider ${getRarityBadgeBg(
                              selectedCell.rarity_score
                            )}`}
                          >
                            {getRarityLabel(selectedCell.rarity_score)} ({selectedCell.rarity_score})
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs font-mono">
                          <div>
                            <span className="text-[9px] text-text-secondary uppercase tracking-wider font-bold block mb-1">
                              Matrix Coordinate
                            </span>
                            <span className="text-text-primary text-sm font-semibold">
                              [{selectedCell.coord_x}, {selectedCell.coord_y}]
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-text-secondary uppercase tracking-wider font-bold block mb-1">
                              Status
                            </span>
                            <span
                              className={`text-sm font-semibold ${selectedCell.status === 'LISTED'
                                ? 'text-accent-mint'
                                : selectedCell.status === 'SOLD'
                                  ? 'text-text-secondary'
                                  : 'text-accent-gold'
                                }`}
                            >
                              {selectedCell.status === 'IDLE'
                                ? 'Museum Vault'
                                : selectedCell.status === 'LISTED'
                                  ? 'Listed'
                                  : 'Collected'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] text-text-secondary uppercase tracking-wider font-bold block">
                            Owner Key
                          </span>
                          <span className="font-mono text-[10px] bg-background/50 border border-border p-2 rounded block break-all select-all text-text-primary flex items-center justify-between">
                            <span>
                              {account?.toLowerCase() === selectedCell.owner_address.toLowerCase()
                                ? `You (${selectedCell.owner_address.substring(0, 6)}...${selectedCell.owner_address.substring(selectedCell.owner_address.length - 4)})`
                                : selectedCell.owner_address}
                            </span>
                            {account?.toLowerCase() === selectedCell.owner_address.toLowerCase() && (
                              <span className="bg-accent-gold/25 text-accent-gold text-[8px] font-mono px-1 rounded uppercase font-bold">You</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Escrow Forms & Actions */}
                      <div className="border-t border-border pt-4 space-y-4">
                        {txStep !== 'IDLE' && (
                          <div className="p-4 bg-surface-elevated border border-border rounded-lg space-y-3 font-sans">
                            <div className="flex justify-between items-center pb-2 border-b border-border/40">
                              <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                                Transaction Progress
                              </h4>
                              {(txStep === 'SUCCESS' || txStep === 'FAILED') && (
                                <button
                                  onClick={resetTx}
                                  className="text-text-secondary hover:text-text-primary text-[10px] font-mono cursor-pointer uppercase"
                                >
                                  Close
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              {txStep !== 'SUCCESS' && txStep !== 'FAILED' && (
                                <CircleNotch size={18} className="animate-spin text-accent-gold shrink-0" />
                              )}
                              <span className="text-xs font-mono text-text-primary">
                                {txStep === 'SUBMITTING' && 'Signature Request Pending...'}
                                {txStep === 'BROADCASTED_PENDING' && 'Broadcasting to Blockchain...'}
                                {txStep === 'BLOCK_CONFIRMED' && 'Verifying On-Chain Confirmation...'}
                                {txStep === 'SUCCESS' && 'Transaction Succeeded!'}
                                {txStep === 'FAILED' && (errorMsg || 'Transaction Failed')}
                              </span>
                            </div>

                            {txHash && (
                              <div className="text-[10px] text-text-secondary font-mono break-all bg-background/40 p-1.5 rounded">
                                Hash: {txHash.slice(0, 10)}...{txHash.slice(-10)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Listing Status and Escrow actions */}
                        {selectedCell.status === 'LISTED' && (() => {
                          const priceWei = BigInt(selectedCell.price || '0');
                          const platformCut = (priceWei * BigInt(500)) / BigInt(10000);
                          const totalDueWei = priceWei + platformCut;

                          const subtotalEth = ethers.formatEther(priceWei);
                          const platformFeeEth = ethers.formatEther(platformCut);
                          const totalDueEth = ethers.formatEther(totalDueWei);

                          const isMyListing = account?.toLowerCase() === cellDetails?.listing?.seller?.toLowerCase();

                          return (
                            <div className="space-y-4">
                              <div className="bg-surface-elevated border border-border rounded-lg p-4 space-y-3 font-sans">
                                <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest border-b border-border/40 pb-2">
                                  Price Breakdown
                                </h4>
                                <div className="space-y-1.5 text-xs text-text-secondary">
                                  <div className="flex justify-between items-center">
                                    <span>Subtotal (Base Asset Value)</span>
                                    <span className="font-mono font-medium text-text-primary">
                                      {parseFloat(subtotalEth).toFixed(4)} ETH
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span>Platform Service Fee (5%)</span>
                                    <span className="font-mono font-medium text-text-primary">
                                      {parseFloat(platformFeeEth).toFixed(4)} ETH
                                    </span>
                                  </div>
                                </div>
                                <div className="border-t border-dashed border-border/60 pt-2.5 flex justify-between items-center">
                                  <span className="text-xs font-bold text-text-primary">TOTAL DUE</span>
                                  <span className="text-base font-mono font-bold text-accent-gold flex items-center gap-0.5">
                                    <Coins size={14} className="text-accent-gold" />
                                    {parseFloat(totalDueEth).toFixed(4)} ETH
                                  </span>
                                </div>
                              </div>

                              {!isMyListing ? (
                                <div className="space-y-2">
                                  <button
                                    onClick={handleBuyFragment}
                                    disabled={txStep !== 'IDLE'}
                                    className="w-full bg-text-primary text-background hover:opacity-90 disabled:opacity-30 font-semibold text-xs uppercase tracking-wider py-2.5 rounded transition-all flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                    <Tag size={13} />
                                    {txStep !== 'IDLE' ? 'Securing Escrow...' : 'Buy instantly'}
                                  </button>
                                  <p className="text-[10px] text-center text-text-secondary">
                                    Confirm payment of {parseFloat(totalDueEth).toFixed(4)} ETH via MetaMask
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {/* Non-listed Action Layouts */}
                        {selectedCell.status !== 'LISTED' && (
                          <div className="space-y-4">
                            {selectedCell.is_reserved ? (
                              <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-lg text-xs text-amber-500 leading-relaxed font-sans flex items-start gap-2.5">
                                <Lock size={18} className="shrink-0 text-amber-500 mt-0.5" weight="fill" />
                                <div>
                                  <span className="font-bold block uppercase tracking-wider text-[10px] mb-1">
                                    Institutional Heritage Reservation
                                  </span>
                                  This fragment is reserved under the 25% Institutional Reservation Policy. It is permanently escrowed to guarantee physical authenticity proof and cannot be listed or traded.
                                </div>
                              </div>
                            ) : account?.toLowerCase() === selectedCell.owner_address.toLowerCase() ? (
                              <div className="space-y-3">
                                <label className="text-[10px] text-text-secondary uppercase tracking-wider font-bold flex items-center gap-1">
                                  <Tag size={12} />
                                  List fragment
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={listPrice}
                                    disabled={txStep !== 'IDLE'}
                                    onChange={(e) => setListPrice(e.target.value)}
                                    placeholder="Price in ETH"
                                    className="flex-grow bg-background border border-border rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent-gold text-text-primary font-mono"
                                  />
                                  <button
                                    onClick={handleListFragment}
                                    disabled={txStep !== 'IDLE' || !listPrice}
                                    className="bg-text-primary text-background hover:opacity-90 disabled:opacity-30 px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    List
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <label className="text-[10px] text-text-secondary uppercase tracking-wider font-bold flex items-center gap-1">
                                  <Gavel size={12} />
                                  Lock escrow bid
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={bidAmount}
                                    disabled={txStep !== 'IDLE'}
                                    onChange={(e) => setBidAmount(e.target.value)}
                                    placeholder="Bid in ETH"
                                    className="flex-grow bg-background border border-border rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent-gold text-text-primary font-mono"
                                  />
                                  <button
                                    onClick={handlePlaceBid}
                                    disabled={txStep !== 'IDLE' || !bidAmount}
                                    className="bg-accent-gold text-background hover:opacity-90 disabled:opacity-30 px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Bid
                                  </button>
                                </div>
                                {(() => {
                                  const currentOwner = cellDetails
                                    ? (cellDetails.listing ? cellDetails.listing.seller : cellDetails.owner_address)
                                    : selectedCell.owner_address;
                                  const isPrimaryBid = artwork && currentOwner
                                    ? currentOwner.toLowerCase() === artwork.museum_address.toLowerCase()
                                    : true;
                                  if (bidAmount && !isNaN(parseFloat(bidAmount)) && !isPrimaryBid) {
                                    return (
                                      <div className="mt-3 bg-surface-elevated border border-border/60 rounded-lg p-3.5 space-y-2 text-xs font-sans shadow-sm">
                                        <div className="flex justify-between items-center text-text-secondary">
                                          <span>Your Offer to Owner</span>
                                          <span className="font-mono text-text-primary font-medium">
                                            {parseFloat(bidAmount).toFixed(4)} ETH
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center text-text-secondary">
                                          <span>Platform Network Fee (5%)</span>
                                          <span className="font-mono text-text-primary font-medium">
                                            {(parseFloat(bidAmount) * 0.05).toFixed(4)} ETH
                                          </span>
                                        </div>
                                        <div className="border-t border-dashed border-border/60 pt-2 flex justify-between items-center text-text-primary font-bold">
                                          <span>Total Capital Locked in Escrow</span>
                                          <span className="font-mono text-accent-gold font-bold">
                                            {(parseFloat(bidAmount) * 1.05).toFixed(4)} ETH
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Active Escrow Bids */}
                        {cellDetails && cellDetails.bids.length > 0 && (
                          <div className="border-t border-border pt-4 space-y-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                              <Gavel size={12} />
                              Active Escrow Bids ({cellDetails.bids.length})
                            </h4>
                            <div className="divide-y divide-border max-h-40 overflow-y-auto pr-1">
                              {cellDetails.bids.map((bid) => {
                                const isBidder = account?.toLowerCase() === bid.bidder.toLowerCase();
                                const isOwner = account?.toLowerCase() === selectedCell.owner_address.toLowerCase();

                                const currentOwnerAddr = selectedCell.owner_address;
                                const isMuseumOwner = artwork && currentOwnerAddr
                                  ? currentOwnerAddr.toLowerCase() === artwork.museum_address.toLowerCase()
                                  : true;

                                const bidAmountWei = BigInt(bid.amount);
                                const platformCutWei = (bidAmountWei * BigInt(500)) / BigInt(10000);
                                const museumRoyaltyWei = (bidAmountWei * BigInt(700)) / BigInt(10000);
                                const netProceedsWei = isMuseumOwner
                                  ? bidAmountWei - platformCutWei
                                  : bidAmountWei - museumRoyaltyWei;

                                const grossEth = ethers.formatEther(bidAmountWei);
                                const platformCutEth = ethers.formatEther(platformCutWei);
                                const museumRoyaltyEth = ethers.formatEther(museumRoyaltyWei);
                                const netProceedsEth = ethers.formatEther(netProceedsWei);

                                if (isOwner) {
                                  return (
                                    <div key={bid.id} className="bg-surface-elevated border border-border/80 rounded-lg p-3.5 space-y-3 font-sans my-3 first:mt-0 last:mb-0">
                                      <div className="flex justify-between items-center border-b border-border/40 pb-2">
                                        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                                          Incoming Offer
                                        </span>
                                        <span className="text-[9px] font-mono text-text-secondary flex items-center gap-1">
                                          {isBidder ? (
                                            <span className="bg-accent-gold/25 text-accent-gold px-1 rounded uppercase font-bold text-[8px]">You</span>
                                          ) : (
                                            `by ${bid.bidder.substring(0, 6)}...${bid.bidder.substring(bid.bidder.length - 4)}`
                                          )}
                                        </span>
                                      </div>

                                      <div className="space-y-1.5 text-xs text-text-secondary">
                                        <div className="flex justify-between items-center">
                                          <span>Gross Collector Offer</span>
                                          <span className="font-mono font-medium text-text-primary">
                                            {parseFloat(grossEth).toFixed(4)} ETH
                                          </span>
                                        </div>
                                        {isMuseumOwner ? (
                                          <div className="flex justify-between items-center">
                                            <span>Platform Cut Deduction (5%)</span>
                                            <span className="font-mono font-medium text-text-primary">
                                              - {parseFloat(platformCutEth).toFixed(4)} ETH
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex justify-between items-center">
                                            <span>Creator Royalty Deduction (7%)</span>
                                            <span className="font-mono font-medium text-text-primary">
                                              - {parseFloat(museumRoyaltyEth).toFixed(4)} ETH
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      <div className="border-t border-dashed border-border/60 pt-2.5 flex justify-between items-center">
                                        <span className="text-xs font-bold text-text-primary">
                                          {isMuseumOwner ? "NET INSTITUTIONAL PROCEEDS" : "NET SELLER PROCEEDS"}
                                        </span>
                                        <span className="text-sm font-mono font-bold text-accent-gold">
                                          {parseFloat(netProceedsEth).toFixed(4)} ETH
                                        </span>
                                      </div>

                                      <div className="pt-1 flex gap-2">
                                        <button
                                          onClick={() => handleAcceptBid(bid.id)}
                                          disabled={txStep !== 'IDLE'}
                                          className="flex-grow bg-accent-mint text-background hover:opacity-90 py-1.5 rounded text-[10px] transition-all font-semibold uppercase tracking-wider cursor-pointer text-center disabled:opacity-30"
                                        >
                                          Accept Offer
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={bid.id} className={`flex justify-between items-center py-2 text-xs border-b border-border/40 last:border-0 px-2 rounded ${isBidder ? 'bg-accent-gold/5 border border-accent-gold/15 my-1.5' : ''}`}>
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-accent-gold font-mono">
                                          {ethers.formatEther(bid.amount)} ETH
                                        </span>
                                        {isBidder && (
                                          <span className="bg-accent-gold/25 text-accent-gold text-[8px] font-mono px-1 rounded uppercase font-bold">You</span>
                                        )}
                                      </div>
                                      <span className="text-text-secondary block font-mono text-[9px] mt-0.5">
                                        by {isBidder ? 'You' : `${bid.bidder.substring(0, 6)}...${bid.bidder.substring(bid.bidder.length - 4)}`}
                                      </span>
                                    </div>
                                    <div className="flex gap-1.5" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Block 2: Live Grid Focus (Dynamic Hover) */}
                <div className="bg-surface/60 border border-border rounded-lg p-5 space-y-4 backdrop-blur-xs">
                  <div className="flex justify-between items-center border-b border-border pb-3">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-gold opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-gold"></span>
                      </span>
                      Live Grid Focus
                    </h2>
                    <span className="text-[9px] font-mono text-text-secondary uppercase tracking-wider">
                      {hoveredCell ? 'Active telemetry' : 'Idle scan'}
                    </span>
                  </div>

                  {hoveredCell ? (
                    <div className="flex gap-4 items-center">
                      {/* Magnified Viewport Segment */}
                      <div
                        className="w-16 h-16 rounded-lg border border-border shadow-inner shrink-0 relative"
                        style={{
                          backgroundImage: `url(${artworkImageUrl})`,
                          backgroundSize: '1000% 1000%',
                          backgroundPosition: `${hoveredCell.coord_x * 11.111}% ${hoveredCell.coord_y * 11.111}%`,
                        }}
                      />
                      <div className="flex-grow space-y-1">
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-sm font-bold text-text-primary">
                            Fragment #{hoveredCell.token_id}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-sans font-bold uppercase tracking-wider ${getRarityBadgeBg(
                              hoveredCell.rarity_score
                            )}`}
                          >
                            {getRarityLabel(hoveredCell.rarity_score)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-[10px] font-mono text-text-secondary">
                          <div>
                            Coord:{' '}
                            <span className="text-text-primary font-semibold">
                              [{hoveredCell.coord_x}, {hoveredCell.coord_y}]
                            </span>
                          </div>
                          <div>
                            Score:{' '}
                            <span className="text-text-primary font-semibold">
                              {hoveredCell.rarity_score}
                            </span>
                          </div>
                          <div className="col-span-2 mt-0.5">
                            Status:{' '}
                            <span
                              className={`font-semibold ${hoveredCell.status === 'LISTED'
                                ? 'text-emerald-500'
                                : hoveredCell.status === 'SOLD'
                                  ? 'text-rose-400'
                                  : 'text-accent-gold'
                                }`}
                            >
                              {hoveredCell.status === 'IDLE'
                                ? 'Museum Vault'
                                : hoveredCell.status === 'LISTED'
                                  ? 'Listed'
                                  : 'Collected'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-4 text-xs text-text-secondary font-mono justify-center">
                      <span>Scanning coordinate grid...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start animate-fadeIn">
              {/* Left Panel: Listings/Bids Switcher Tabs (7 cols) */}
              <div className="lg:col-span-7 bg-surface border border-border rounded-lg p-6 space-y-6">
                <div className="border-b border-border pb-3 flex justify-between items-center flex-wrap gap-4">
                  <div className="flex gap-6">
                    <button
                      onClick={() => setSubTab('listings')}
                      className={`text-xs uppercase tracking-wider font-bold pb-2 transition-colors cursor-pointer border-b-2 ${subTab === 'listings' ? 'text-text-primary border-accent-gold' : 'text-text-secondary border-transparent hover:text-text-primary'
                        }`}
                    >
                      Listing ({grid.filter(c => c.status === 'LISTED').length})
                    </button>
                    <button
                      onClick={() => setSubTab('bids')}
                      className={`text-xs uppercase tracking-wider font-bold pb-2 transition-colors cursor-pointer border-b-2 ${subTab === 'bids' ? 'text-text-primary border-accent-gold' : 'text-text-secondary border-transparent hover:text-text-primary'
                        }`}
                    >
                      Bidding ({artworkBids.length})
                    </button>
                  </div>
                </div>

                {subTab === 'listings' ? (
                  grid.filter(c => c.status === 'LISTED').length === 0 ? (
                    <div className="py-20 text-center text-text-secondary text-xs font-mono">
                      No active fragment listings for this monument.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border text-[9px] uppercase tracking-widest text-text-secondary font-bold">
                            <th className="py-3 px-2">Token ID</th>
                            <th className="py-3 px-2">Position</th>
                            <th className="py-3 px-2">Owner Address</th>
                            <th className="py-3 px-2 text-right">Base Price</th>
                            <th className="py-3 px-2 text-right">Buyer Bill Total</th>
                            <th className="py-3 px-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs font-mono divide-y divide-border">
                          {grid
                            .filter(c => c.status === 'LISTED')
                            .sort((a, b) => {
                              const priceA = parseFloat(a.price || '0');
                              const priceB = parseFloat(b.price || '0');
                              return priceA - priceB;
                            })
                            .map((cell) => {
                              const priceWei = BigInt(cell.price || '0');
                              const platformCut = (priceWei * BigInt(500)) / BigInt(10000);
                              const totalDueWei = priceWei + platformCut;

                              const basePriceEth = ethers.formatEther(priceWei);
                              const totalDueEth = ethers.formatEther(totalDueWei);

                              const isMyListing = account?.toLowerCase() === cell.owner_address.toLowerCase();

                              return (
                                <tr key={cell.id} className={`transition-colors duration-150 ${isMyListing ? 'bg-accent-gold/5 border border-accent-gold/10' : 'hover:bg-surface-elevated/40'}`}>
                                  <td className="py-4 px-2 font-bold text-text-primary">
                                    #{cell.token_id}
                                    {isMyListing && (
                                      <span className="ml-1.5 bg-accent-gold/25 text-accent-gold text-[8px] font-mono px-1 rounded font-bold uppercase">You</span>
                                    )}
                                  </td>
                                  <td className="py-4 px-2 text-text-secondary">[{cell.coord_x}, {cell.coord_y}]</td>
                                  <td className="py-4 px-2 text-text-secondary font-mono">
                                    {isMyListing ? (
                                      <span className="text-accent-gold font-medium">You</span>
                                    ) : (
                                      `${cell.owner_address.substring(0, 6)}...${cell.owner_address.substring(cell.owner_address.length - 4)}`
                                    )}
                                  </td>
                                  <td className="py-4 px-2 text-right text-text-secondary">{parseFloat(basePriceEth).toFixed(4)} ETH</td>
                                  <td className="py-4 px-2 text-right font-bold text-accent-gold">{parseFloat(totalDueEth).toFixed(4)} ETH</td>
                                  <td className="py-4 px-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setSelectedCell(cell);
                                          setActiveTab('heatmap');
                                        }}
                                        className="bg-text-primary text-background hover:opacity-90 text-[10px] font-sans font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-all cursor-pointer inline-flex items-center gap-1 shrink-0"
                                      >
                                        <span>Console</span>
                                        <ArrowUpRight size={10} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  artworkBids.length === 0 ? (
                    <div className="py-20 text-center text-text-secondary text-xs font-mono">
                      No active bids for this monument fragments.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border text-[9px] uppercase tracking-widest text-text-secondary font-bold">
                            <th className="py-3 px-2">Token ID</th>
                            <th className="py-3 px-2">Position</th>
                            <th className="py-3 px-2">Bidder Address</th>
                            <th className="py-3 px-2 text-right">Bid Amount</th>
                            <th className="py-3 px-2 text-right">Total Capital Locked</th>
                            <th className="py-3 px-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs font-mono divide-y divide-border">
                          {artworkBids
                            .sort((a, b) => {
                              const amountA = parseFloat(a.amount || '0');
                              const amountB = parseFloat(b.amount || '0');
                              return amountB - amountA;
                            })
                            .map((bid) => {
                              const bidAmountWei = BigInt(bid.amount);

                              const cellOwner = grid.find(c => c.token_id === bid.token_id)?.owner_address;
                              const isPrimary = artwork && cellOwner
                                ? cellOwner.toLowerCase() === artwork.museum_address.toLowerCase()
                                : true;

                              const platformCutWei = isPrimary ? BigInt(0) : (bidAmountWei * BigInt(500)) / BigInt(10000);
                              const totalEscrowWei = bidAmountWei + platformCutWei;

                              const bidAmountEth = ethers.formatEther(bidAmountWei);
                              const totalEscrowEth = ethers.formatEther(totalEscrowWei);

                              const isMyBid = account?.toLowerCase() === bid.bidder.toLowerCase();

                              return (
                                <tr key={bid.id} className={`transition-colors duration-150 ${isMyBid ? 'bg-accent-gold/5 border border-accent-gold/10' : 'hover:bg-surface-elevated/40'}`}>
                                  <td className="py-4 px-2 font-bold text-text-primary">
                                    #{bid.token_id}
                                    {isMyBid && (
                                      <span className="ml-1.5 bg-accent-gold/25 text-accent-gold text-[8px] font-mono px-1 rounded font-bold uppercase">You</span>
                                    )}
                                  </td>
                                  <td className="py-4 px-2 text-text-secondary">[{bid.coord_x}, {bid.coord_y}]</td>
                                  <td className="py-4 px-2 text-text-secondary font-mono">
                                    {isMyBid ? (
                                      <span className="text-accent-gold font-medium">You</span>
                                    ) : (
                                      `${bid.bidder.substring(0, 6)}...${bid.bidder.substring(bid.bidder.length - 4)}`
                                    )}
                                  </td>
                                  <td className="py-4 px-2 text-right text-text-secondary">{parseFloat(bidAmountEth).toFixed(4)} ETH</td>
                                  <td className="py-4 px-2 text-right font-bold text-accent-gold">{parseFloat(totalEscrowEth).toFixed(4)} ETH</td>
                                  <td className="py-4 px-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          const cell = grid.find(c => c.token_id === bid.token_id);
                                          if (cell) {
                                            setSelectedCell(cell);
                                            setActiveTab('heatmap');
                                          }
                                        }}
                                        className="bg-text-primary text-background hover:opacity-90 text-[10px] font-sans font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-all cursor-pointer inline-flex items-center gap-1 shrink-0"
                                      >
                                        <span>Console</span>
                                        <ArrowUpRight size={10} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>

              {/* Right Panel: Live Transaction History Log (5 cols) */}
              <div className="lg:col-span-5 bg-surface border border-border rounded-lg p-6 space-y-6">
                <div className="border-b border-border pb-3 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                    Live Transaction History
                  </h3>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-gold opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-gold"></span>
                  </span>
                </div>

                {loadingHistory && rawHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-2">
                    <CircleNotch size={20} className="text-accent-gold animate-spin" />
                    <span className="text-xs text-text-secondary font-mono">Loading telemetry logs...</span>
                  </div>
                ) : rawHistory.length === 0 ? (
                  <div className="py-20 text-center text-text-secondary text-xs font-mono">
                    No transaction records indexed yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[450px] overflow-y-auto pr-1">
                    {rawHistory.map((tx) => {
                      if (!tx.seller || !tx.buyer) return null;
                      const displaySeller = tx.seller.toLowerCase() === artwork.museum_address.toLowerCase()
                        ? 'Museum'
                        : `${tx.seller.substring(0, 6)}...${tx.seller.substring(tx.seller.length - 4)}`;
                      const displayBuyer = tx.buyer.toLowerCase() === artwork.museum_address.toLowerCase()
                        ? 'Museum'
                        : `${tx.buyer.substring(0, 6)}...${tx.buyer.substring(tx.buyer.length - 4)}`;

                      const dateStr = new Date(tx.timestamp * 1000).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      return (
                        <div key={tx.id} className="py-3 first:pt-0 pb-1 text-xs space-y-1.5">
                          <div className="flex justify-between text-[9px] text-text-secondary font-mono">
                            <span>Transaction Telemetry</span>
                            <span>{dateStr}</span>
                          </div>
                          <p className="text-text-primary leading-relaxed font-sans">
                            Fragment <span className="font-semibold font-mono">#{tx.token_id}</span> transferred from{' '}
                            <span className="font-mono text-text-secondary">{displaySeller}</span> to{' '}
                            <span className="font-mono text-text-secondary">{displayBuyer}</span> for{' '}
                            <span className="font-mono font-bold text-accent-mint">{tx.priceInEther.toFixed(4)} ETH</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
