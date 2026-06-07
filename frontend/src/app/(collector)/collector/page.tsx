'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import { API_BASE } from '@/config/env';
import { truncateAddress } from '@/lib/utils';
import { 
  PuzzlePiece, 
  CircleNotch,
  ChartPie,
  XCircle,
  Coins,
  SquareHalf,
  ArrowsLeftRight,
  CheckCircle,
  Clock,
  TrendUp
} from '@phosphor-icons/react';

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
  is_reserved?: boolean;
}

interface ArtworkCollection {
  artwork: Artwork;
  ownedFragments: FragmentCell[];
  totalFragments: number;
  completenessPercent: number;
}

interface BidInfo {
  id: string;
  fragment_id: string;
  token_id: number;
  artwork_id: string;
  artwork_title: string;
  amount: string;
  status: string;
  bidder?: string;
}

export default function CollectorDashboard() {
  const { address } = useAccount();
  const { account: contextAccount, contracts, getPrivateSigner } = useWallet();
  const account = address || contextAccount;
  const router = useRouter();
  const [portfolioSubTab, setPortfolioSubTab] = useState<'my-bids' | 'received-offers'>('my-bids');
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [collection, setCollection] = useState<ArtworkCollection[]>([]);
  const [bids, setBids] = useState<BidInfo[]>([]);
  const [receivedBids, setReceivedBids] = useState<BidInfo[]>([]);
  const [priceHistories, setPriceHistories] = useState<Record<string, any[]>>({});
  const [listings, setListings] = useState<any[]>([]);
  const [collectorAnalytics, setCollectorAnalytics] = useState({
    net_realized_profit: "0",
    active_collateral: "0",
  });
  
  // Action states
  const [cancellingBidId, setCancellingBidId] = useState<string | null>(null);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);

  // Load collector data when account changes
  useEffect(() => {
    if (account) {
      loadCollectorData();
    } else {
      setLoading(false);
      setCollection([]);
      setBids([]);
      setReceivedBids([]);
      setListings([]);
      setCollectorAnalytics({
        net_realized_profit: "0",
        active_collateral: "0",
      });
    }
  }, [account]);

  const loadCollectorData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Listings to compute Floor Prices
      try {
        const listingsRes = await fetch(`${API_BASE}/api/listings`);
        if (listingsRes.ok) {
          const listingsData = await listingsRes.json();
          setListings(listingsData);
        }
      } catch (err) {
        console.warn('Error fetching listings:', err);
      }

      // 2. Fetch Collector Analytics
      try {
        const analyticsRes = await fetch(`${API_BASE}/api/analytics/collector/${account}`);
        if (analyticsRes.ok) {
          const analyticsData = await analyticsRes.json();
          setCollectorAnalytics({
            net_realized_profit: analyticsData.net_realized_profit || "0",
            active_collateral: analyticsData.active_collateral || "0",
          });
        }
      } catch (err) {
        console.warn('Error fetching collector analytics:', err);
      }

      // 3. Fetch Artworks & User Collection
      const artRes = await fetch(`${API_BASE}/api/artworks`);
      if (!artRes.ok) throw new Error('Failed to load artworks');
      const artworks: Artwork[] = await artRes.json();

      const userCollections: ArtworkCollection[] = [];
      const histories: Record<string, any[]> = {};

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
            
            // Fetch price history for owned artworks
            try {
              const histRes = await fetch(`${API_BASE}/api/analytics/artwork/${art.id}/price-history`);
              if (histRes.ok) {
                const histData = await histRes.json();
                histories[art.id] = histData;
              }
            } catch (err) {
              console.warn(`Could not load price history for ${art.id}:`, err);
            }
          }
        }
      }

      setCollection(userCollections);
      setPriceHistories(histories);

      // 4. Fetch User Bids
      await loadUserBids();

      // 5. Fetch Received Offers
      await loadReceivedBids();

    } catch (e) {
      console.error('Error loading collector data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadUserBids = async () => {
    if (!account) return;
    try {
      const bidsRes = await fetch(`${API_BASE}/api/bids/bidder/${account}`);
      if (bidsRes.ok) {
        const bidsData = await bidsRes.json();
        setBids(bidsData);
      }
    } catch (e) {
      console.error('Error fetching user bids:', e);
    }
  };

  const loadReceivedBids = async () => {
    if (!account) return;
    try {
      const res = await fetch(`${API_BASE}/api/bids/owner/${account}`);
      if (res.ok) {
        const receivedData = await res.json();
        setReceivedBids(receivedData);
      }
    } catch (e) {
      console.error('Error fetching received bids:', e);
    }
  };

  const handleCancelBid = async (bidIdStr: string) => {
    if (!contracts || !account) return;
    const bidId = parseInt(bidIdStr);
    
    setCancellingBidId(bidIdStr);
    try {
      const signer = await getPrivateSigner();
      if (!signer) throw new Error('Signer not available');

      const marketplaceContract = new ethers.Contract(
        contracts.FragmentMarketplace.address,
        contracts.FragmentMarketplace.abi,
        signer
      );

      const tx = await marketplaceContract.cancelBid(bidId);
      await tx.wait();
      await loadCollectorData();
    } catch (e) {
      console.error('Cancel bid error:', e);
      alert('Error cancelling bid. See console for details.');
    } finally {
      setCancellingBidId(null);
    }
  };

  const handleAcceptBid = async (bidIdStr: string) => {
    if (!contracts || !account) return;
    const bidId = parseInt(bidIdStr);
    
    setAcceptingBidId(bidIdStr);
    try {
      const signer = await getPrivateSigner();
      if (!signer) throw new Error('Signer not available');

      const marketplaceContract = new ethers.Contract(
        contracts.FragmentMarketplace.address,
        contracts.FragmentMarketplace.abi,
        signer
      );

      const tx = await marketplaceContract.acceptBid(bidId);
      await tx.wait();
      await loadCollectorData();
    } catch (e) {
      console.error('Accept bid error:', e);
      alert('Error accepting bid. Make sure contract has approval if listing is active.');
    } finally {
      setAcceptingBidId(null);
    }
  };

  if (!account) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] font-sans">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full border border-border bg-surface/90 backdrop-blur-md rounded-2xl p-8 shadow-2xl space-y-6 text-center relative overflow-hidden"
        >
          {/* Shimmering Gold Accent Bar */}
          <div className="absolute top-0 inset-x-0 h-[3px] bg-accent-gold" />
          
          <div className="flex justify-center">
            <div className="p-5 rounded-full border border-accent-gold/25 bg-accent-gold/5 flex items-center justify-center">
              <PuzzlePiece size={28} className="text-accent-gold" />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent-gold font-bold">
              [ Gateway Security ]
            </div>
            <h2 className="text-lg font-serif font-bold tracking-tight text-text-primary">
              Collector Portfolio Offline
            </h2>
            <p className="text-text-secondary text-xs leading-relaxed max-w-xs mx-auto">
              Connect your wallet or toggle Developer Wallet Mode in the top header to view your collected fragments, active bids, and portfolio analytics.
            </p>
          </div>

          <div className="border-t border-border/60 pt-5 flex items-center justify-center gap-4 text-[9px] font-mono text-text-secondary tracking-widest uppercase">
            <span className="flex h-1.5 w-1.5 rounded-full bg-accent-gold animate-pulse" />
            <span>Vault Authorization Required</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // Compute floor prices
  const floorPrices: Record<string, number> = {};
  collection.forEach(({ artwork }) => {
    floorPrices[artwork.id] = 0.05;
  });

  listings.forEach((listing) => {
    const artId = listing.fragment_id.substring(0, listing.fragment_id.lastIndexOf('_'));
    const priceEth = parseFloat(ethers.formatEther(listing.price));
    if (floorPrices[artId] === undefined || floorPrices[artId] === 0.05 || priceEth < floorPrices[artId]) {
      floorPrices[artId] = priceEth;
    }
  });

  const totalPortfolioValue = collection.reduce((sum, item) => {
    const floor = floorPrices[item.artwork.id] !== undefined ? floorPrices[item.artwork.id] : 0.05;
    // Exclude reserved fragments from portfolio valuation
    const nonReservedOwnedFragments = item.ownedFragments.filter(cell => !cell.is_reserved);
    return sum + (nonReservedOwnedFragments.length * floor);
  }, 0);

  const totalOwnedSectors = collection.reduce((sum, item) => {
    const nonReserved = item.ownedFragments.filter(cell => !cell.is_reserved);
    return sum + nonReserved.length;
  }, 0);
  const averageRarity = totalOwnedSectors > 0 
    ? (collection.reduce((sum, item) => {
        const nonReserved = item.ownedFragments.filter(cell => !cell.is_reserved);
        return sum + nonReserved.reduce((s, f) => s + f.rarity_score, 0);
      }, 0) / totalOwnedSectors).toFixed(2)
    : '0.00';

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
              Collector Portfolio Vault
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Monitor your collected coordinate fragments, floor price indexes, and secondary market activities.
            </p>
          </div>

          {/* Analytics Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="bg-surface p-6 border border-border rounded-2xl space-y-2 hover:border-accent-gold/30 hover:shadow-xl transition-all duration-300 relative overflow-hidden group shadow-xs">
              <div className="flex justify-between items-center text-text-secondary">
                <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-accent-gold transition-colors">Total Coordinates Owned</span>
                <SquareHalf size={16} className="text-accent-gold group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-3xl font-mono font-bold text-text-primary">{totalOwnedSectors} Sectors</div>
              <p className="text-[9px] text-text-secondary leading-none">Accumulated fragments from all artworks</p>
            </div>

            <div className="bg-surface p-6 border border-border rounded-2xl space-y-2 hover:border-accent-gold/30 hover:shadow-xl transition-all duration-300 relative overflow-hidden group shadow-xs">
              <div className="flex justify-between items-center text-text-secondary">
                <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-accent-gold transition-colors">Average Rarity Score</span>
                <ChartPie size={16} className="text-accent-mint group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-3xl font-mono font-bold text-text-primary">{averageRarity} / 100</div>
              <p className="text-[9px] text-text-secondary leading-none">Weighted positional center index</p>
            </div>

            <div className="bg-surface p-6 border border-border rounded-2xl space-y-2 hover:border-accent-gold/30 hover:shadow-xl transition-all duration-300 relative overflow-hidden group shadow-xs">
              <div className="flex justify-between items-center text-text-secondary">
                <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-accent-gold transition-colors">Estimated Portfolio Value</span>
                <Coins size={16} className="text-accent-gold group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-3xl font-mono font-bold text-accent-gold">
                {totalPortfolioValue.toFixed(4)} ETH
              </div>
              <p className="text-[9px] text-text-secondary leading-none">Sum of fragments valued at their floor price</p>
            </div>

            <div className="bg-surface p-6 border border-border rounded-2xl space-y-2 hover:border-accent-gold/30 hover:shadow-xl transition-all duration-300 relative overflow-hidden group shadow-xs">
              <div className="flex justify-between items-center text-text-secondary">
                <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-accent-gold transition-colors">Net Realized Profit (ROI)</span>
                <TrendUp size={16} className={`${parseFloat(collectorAnalytics.net_realized_profit) >= 0 ? "text-accent-mint" : "text-red-500"} group-hover:scale-110 transition-transform`} />
              </div>
              <div className={`text-3xl font-mono font-bold ${parseFloat(collectorAnalytics.net_realized_profit) >= 0 ? "text-accent-mint" : "text-red-500"}`}>
                {parseFloat(ethers.formatEther(collectorAnalytics.net_realized_profit)).toFixed(4)} ETH
              </div>
              <p className="text-[9px] text-text-secondary leading-none">Capital gains from sold flips (minus royalties)</p>
            </div>

            <div className="bg-surface p-6 border border-border rounded-2xl space-y-2 hover:border-accent-gold/30 hover:shadow-xl transition-all duration-300 relative overflow-hidden group shadow-xs">
              <div className="flex justify-between items-center text-text-secondary">
                <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-accent-gold transition-colors">Active Bid Collateral</span>
                <Coins size={16} className="text-accent-gold group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-3xl font-mono font-bold text-text-primary">
                {parseFloat(ethers.formatEther(collectorAnalytics.active_collateral)).toFixed(4)} ETH
              </div>
              <p className="text-[9px] text-text-secondary leading-none">Locked escrow funds for active bids</p>
            </div>
          </div>

          {/* Price Telemetry Chart Wall */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-widest flex items-center gap-1.5">
              <ChartPie size={14} />
              <span>Artwork Price Index</span>
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {collection.map(({ artwork }) => {
                const history = priceHistories[artwork.id] || [];
                const floor = floorPrices[artwork.id] !== undefined ? floorPrices[artwork.id] : 0.05;
                return (
                  <div key={artwork.id} className="bg-surface p-6 border border-border rounded-2xl space-y-4 hover:border-accent-gold/25 hover:shadow-md transition-all duration-300 shadow-xs">
                    <div className="flex justify-between items-center border-b border-border pb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">{artwork.title} Price Index</h4>
                        <p className="text-[9px] text-text-secondary uppercase tracking-widest font-mono">Floor Price: {floor.toFixed(3)} ETH</p>
                      </div>
                      <span className="text-[10px] font-bold font-mono text-accent-gold bg-accent-gold/5 border border-accent-gold/10 px-2.5 py-1 rounded-full">7% Creator Royalty</span>
                    </div>

                    {history.length > 0 ? (
                      <div className="space-y-4">
                        <div className="h-32 w-full bg-background/50 rounded border border-border/50 relative p-2 flex items-end">
                          <svg className="w-full h-24 overflow-visible" preserveAspectRatio="none">
                            <polyline
                              fill="none"
                              stroke="var(--color-accent-gold, #c4a46a)"
                              strokeWidth="2.5"
                              points={history.map((pt, i) => {
                                const x = (i / (history.length - 1 || 1)) * 100;
                                const prices = history.map(p => p.priceInEther);
                                const maxP = Math.max(...prices, 0.1);
                                const minP = Math.min(...prices, 0);
                                const range = (maxP - minP) || 1;
                                const y = 90 - ((pt.priceInEther - minP) / range) * 80;
                                return `${x}%,${y}%`;
                              }).join(' ')}
                            />
                            {history.map((pt, i) => {
                              const x = (i / (history.length - 1 || 1)) * 100;
                              const prices = history.map(p => p.priceInEther);
                              const maxP = Math.max(...prices, 0.1);
                              const minP = Math.min(...prices, 0);
                              const range = (maxP - minP) || 1;
                              const y = 90 - ((pt.priceInEther - minP) / range) * 80;
                              return (
                                <circle
                                  key={i}
                                  cx={`${x}%`}
                                  cy={`${y}%`}
                                  r="3"
                                  className="fill-accent-gold stroke-background stroke-2"
                                />
                              );
                            })}
                          </svg>
                        </div>
                        
                        <div className="space-y-2 text-[10px] font-mono">
                          <p className="text-[9px] uppercase tracking-wider text-text-secondary font-bold">Historical Daily Log</p>
                          <div className="divide-y divide-border/50 max-h-36 overflow-y-auto pr-1">
                            {history.map((pt, idx) => (
                              <div key={idx} className="flex justify-between py-1.5">
                                <span className="text-text-secondary">
                                  {new Date(pt.timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <span className="font-bold text-text-primary">{pt.priceInEther.toFixed(3)} ETH</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-32 flex items-center justify-center bg-background/50 border border-border/50 rounded text-center p-6 text-text-secondary text-[10px] font-mono">
                        No secondary transaction logs indexed for this monument yet.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Order Book Monitor Section */}
          <div className="bg-surface border border-border rounded-2xl p-8 space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <ArrowsLeftRight size={18} className="text-accent-gold" />
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Active Order Book Monitor</h3>
                  <p className="text-[10px] text-text-secondary">Monitor your active outgoing bids and incoming offers.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setPortfolioSubTab('my-bids')}
                  className={`relative pb-1 text-xs uppercase tracking-wider font-semibold transition-colors cursor-pointer ${
                    portfolioSubTab === 'my-bids' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span>My Active Bids</span>
                  {portfolioSubTab === 'my-bids' && (
                    <motion.span
                      layoutId="activeBidsSubtabLine"
                      className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-gold"
                    />
                  )}
                </button>
                <button
                  onClick={() => setPortfolioSubTab('received-offers')}
                  className={`relative pb-1 text-xs uppercase tracking-wider font-semibold transition-colors cursor-pointer relative ${
                    portfolioSubTab === 'received-offers' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span>Received Offers</span>
                  {receivedBids.length > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-accent-gold text-background text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none">{receivedBids.length}</span>
                  )}
                  {portfolioSubTab === 'received-offers' && (
                    <motion.span
                      layoutId="activeBidsSubtabLine"
                      className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-gold"
                    />
                  )}
                </button>
              </div>
            </div>

            {portfolioSubTab === 'my-bids' ? (
              bids.length === 0 ? (
                <div className="py-12 text-center text-text-secondary text-xs font-mono">
                  You do not have any active locked-escrow bids on coordinate fragments.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border text-[9px] uppercase tracking-widest text-text-secondary font-bold">
                        <th className="py-2.5">Bid ID</th>
                        <th className="py-2.5">Artifact</th>
                        <th className="py-2.5">Fragment ID</th>
                        <th className="py-2.5">Locked Collateral</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] font-mono divide-y divide-border">
                      {bids.map((bid) => (
                        <tr key={bid.id}>
                          <td className="py-3 text-text-secondary">#{bid.id}</td>
                          <td className="py-3 text-text-primary font-sans font-semibold text-xs">
                            {bid.artwork_title}
                          </td>
                          <td className="py-3 text-text-primary">Token #{bid.token_id}</td>
                          <td className="py-3 text-accent-gold font-bold">
                            {parseFloat(ethers.formatEther(bid.amount)).toFixed(2)} ETH
                          </td>
                          <td className="py-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[8px] font-mono font-bold tracking-wider bg-accent-gold/10 text-accent-gold border border-accent-gold/20 uppercase">
                              {bid.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleCancelBid(bid.id)}
                              disabled={cancellingBidId !== null}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-red-500/20 text-red-500 hover:bg-red-500/5 hover:border-red-500/40 transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                                cancellingBidId === bid.id ? 'opacity-55 cursor-wait' : ''
                              }`}
                            >
                              {cancellingBidId === bid.id ? (
                                <>
                                  <CircleNotch size={10} className="animate-spin" />
                                  <span>Cancelling...</span>
                                </>
                              ) : (
                                <>
                                  <XCircle size={12} />
                                  <span>Cancel Offer</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              receivedBids.length === 0 ? (
                <div className="py-12 text-center text-text-secondary text-xs font-mono">
                  You have not received any active offers on your owned coordinate fragments.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border text-[9px] uppercase tracking-widest text-text-secondary font-bold">
                        <th className="py-2.5">Bid ID</th>
                        <th className="py-2.5">Artifact</th>
                        <th className="py-2.5">Fragment ID</th>
                        <th className="py-2.5">Bidder</th>
                        <th className="py-2.5">Offered Amount</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] font-mono divide-y divide-border">
                      {receivedBids.map((bid) => (
                        <tr key={bid.id}>
                          <td className="py-3 text-text-secondary">#{bid.id}</td>
                          <td className="py-3 text-text-primary font-sans font-semibold text-xs">
                            {bid.artwork_title}
                          </td>
                          <td className="py-3 text-text-primary">Token #{bid.token_id}</td>
                          <td className="py-3 text-text-secondary">
                            {bid.bidder ? truncateAddress(bid.bidder) : 'Unknown'}
                          </td>
                          <td className="py-3 text-accent-gold font-bold">
                            {parseFloat(ethers.formatEther(bid.amount)).toFixed(2)} ETH
                          </td>
                          <td className="py-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[8px] font-mono font-bold tracking-wider bg-accent-gold/10 text-accent-gold border border-accent-gold/20 uppercase">
                              {bid.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleAcceptBid(bid.id)}
                              disabled={acceptingBidId !== null}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-accent-mint/20 text-accent-mint hover:bg-accent-mint/5 hover:border-accent-mint/40 transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                                acceptingBidId === bid.id ? 'opacity-55 cursor-wait' : ''
                              }`}
                            >
                              {acceptingBidId === bid.id ? (
                                <>
                                  <CircleNotch size={10} className="animate-spin" />
                                  <span>Accepting...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle size={12} />
                                  <span>Accept Offer</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
