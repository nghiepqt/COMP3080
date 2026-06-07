'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/app/context/wallet-context';
import { useChainId, useSwitchChain } from 'wagmi';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CloudArrowUp, 
  Sliders, 
  Spinner, 
  CheckCircle, 
  Circle, 
  X, 
  FileImage 
} from '@phosphor-icons/react';
import { API_BASE } from '@/config/env';

export default function OnboardArtifact() {
  const router = useRouter();
  const { account, contracts, getPublicSigner } = useWallet();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  // Form states
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [creationYear, setCreationYear] = useState<number | string>(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const gridSize = 10; // Defaults to 10x10

  // UX states
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2 | 3>(0); // 0: Idle, 1: IPFS, 2: Public Chain, 3: Private Chain
  const [stepStatus, setStepStatus] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [newArtworkId, setNewArtworkId] = useState<string | null>(null);
  
  // Real-time sync tracker
  const [initializedCount, setInitializedCount] = useState(0);
  const [totalFragments, setTotalFragments] = useState(100);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // File drag & drop states
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!file) {
      setImagePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Connect to SSE stream and poll progress endpoint to monitor fragmentation progress robustly
  useEffect(() => {
    if (!newArtworkId || currentStep !== 3) return;

    console.log(`Subscribing to SSE for Artwork ID: ${newArtworkId}`);
    const eventSource = new EventSource(`${API_BASE}/api/events`);

    const checkProgress = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/artworks/${newArtworkId}/initialization-status`);
        if (res.ok) {
          const status = await res.json();
          setTotalFragments(status.total || 100);
          setInitializedCount(status.indexed);
          if (status.indexed >= status.total && status.total > 0) {
            setStepStatus('All fragments successfully initialized on Private Chain!');
            clearInterval(intervalId);
            eventSource.close();
            setTimeout(() => {
              router.push('/museum/inventory');
            }, 2000);
          }
        }
      } catch (err) {
        console.error('Error checking initialization progress:', err);
      }
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE Event in Onboarding:', data);

        if (data.artwork_id === newArtworkId) {
          if (data.type === 'FRAGMENT_INITIALIZED') {
            checkProgress();
          } else if (data.type === 'FRACTIONALIZED') {
            setTotalFragments(data.total_fragments || 100);
            setStepStatus(`Matrix sliced. Initializing fragments on private chain...`);
          }
        }
      } catch (err) {
        console.error('Error parsing SSE in onboarding:', err);
      }
    };

    eventSource.onerror = (e) => {
      console.warn('SSE connection error in onboarding.');
    };

    // Run immediately
    checkProgress();

    // Poll every 1s
    const intervalId = setInterval(checkProgress, 1000);

    return () => {
      eventSource.close();
      clearInterval(intervalId);
    };
  }, [newArtworkId, currentStep, router]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      alert('Wallet not connected. Connect Dev Wallet.');
      return;
    }
    if (!file) {
      alert('Please select an artwork file.');
      return;
    }
    if (!contracts || !contracts.MasterNFT.address) {
      alert('Contract metadata not loaded from backend. Ensure backend is running.');
      return;
    }

    setIsUploading(true);
    setCurrentStep(1);
    setStepStatus('Uploading master asset to IPFS node...');
    setTxHash(null);
    setInitializedCount(0);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('artist', artist);
      formData.append('creation_year', creationYear.toString());
      formData.append('museum_address', account);
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/artworks`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Backend upload failed.');
      }

      const artworkData = await response.json();
      const ipfsHash = artworkData.master_ipfs_hash;
      setNewArtworkId(artworkData.id);
      
      setCurrentStep(2);
      setStepStatus(`IPFS Upload complete. CID: ${ipfsHash.substring(0, 15)}...`);

      // Step 4.1: Enforce Public Chain (31338) for Master Mint if in local mode
      const isLocal = chainId === 31338 || chainId === 9999;
      if (isLocal && chainId !== 31338) {
        setStepStatus('Switching network to Anvil Public Anchor (31338)...');
        try {
          await switchChainAsync({ chainId: 31338 });
          // Give MetaMask a short grace period to update provider state
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } catch (switchErr: any) {
          throw new Error(`Failed to switch network to Public Chain (31338): ${switchErr.message || switchErr}`);
        }
      }

      const signer = await getPublicSigner();
      if (!signer) {
        throw new Error('Signer unavailable. Please check that MetaMask is connected.');
      }

      const masterNFTContract = new ethers.Contract(
        contracts.MasterNFT.address,
        contracts.MasterNFT.abi,
        signer
      );

      setStepStatus('Awaiting wallet signature for Public Provenance Mint...');
      const tx = await masterNFTContract.mintMasterNFT(ipfsHash);
      
      setStepStatus(`Mint tx submitted. Awaiting block confirmation...`);
      setTxHash(tx.hash);
      
      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        throw new Error('Public Chain Master Mint reverted.');
      }
      
      // Step 4.2: Pivot back to Private Chain (9999) if in local mode
      setCurrentStep(3);
      setStepStatus('Master NFT anchored! Returning wallet network to Private Trading Layer (9999)...');
      if (isLocal) {
        try {
          await switchChainAsync({ chainId: 9999 });
        } catch (switchErr: any) {
          console.warn('Post-mint switch to Private Chain (9999) failed or rejected by user:', switchErr);
        }
      }
      
    } catch (err: any) {
      console.error('Onboarding process encountered an error:', err);
      
      // Mask raw error from the user UI, next.js console allows user to diagnose
      setErrorMsg("Onboarding failed. Please review the browser console for diagnostic details.");
      setIsUploading(false);
      setCurrentStep(0);
      
      if (newArtworkId) {
        try {
          await fetch(`${API_BASE}/api/artworks/${newArtworkId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'FAILED' })
          });
        } catch (statusErr) {
          console.error('Failed to report onboarding failure status to backend:', statusErr);
        }
      }
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-serif font-semibold text-text-primary">Onboard New Heritage Artifact</h1>
        <p className="text-xs text-text-secondary">Register a physical artifact, upload it to IPFS, anchor its provenance on Ethereum, and slice it into fractional coordinate-mapped fragments.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Form panel (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-surface p-6 border border-border rounded-lg space-y-6">
            <h2 className="text-base font-serif font-semibold text-text-primary border-b border-border pb-3 flex items-center gap-2">
              <Sliders size={16} className="text-accent-gold" />
              <span>Artifact Metaphysical Spec</span>
            </h2>

            <form onSubmit={handleOnboard} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1.5">
                    Artwork Title
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isUploading}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Rosetta Stone"
                    className="w-full bg-background border border-border rounded px-4 py-2.5 text-xs focus:border-accent-gold focus:outline-none focus:ring-1 focus:ring-accent-gold/25 transition-all text-text-primary font-sans"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1.5">
                      Artist / Origin
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isUploading}
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      placeholder="e.g. Ancient Egypt"
                      className="w-full bg-background border border-border rounded px-4 py-2.5 text-xs focus:border-accent-gold focus:outline-none focus:ring-1 focus:ring-accent-gold/25 transition-all text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1.5">
                      Creation Year
                    </label>
                    <input
                      type="number"
                      required
                      disabled={isUploading}
                      value={creationYear}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setCreationYear('');
                        } else {
                          const parsed = parseInt(val);
                          setCreationYear(isNaN(parsed) ? '' : parsed);
                        }
                      }}
                      placeholder="e.g. -196"
                      className="w-full bg-background border border-border rounded px-4 py-2.5 text-xs focus:border-accent-gold focus:outline-none focus:ring-1 focus:ring-accent-gold/25 transition-all text-text-primary"
                    />
                  </div>
                </div>



                {/* Upload Area */}
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1.5">
                    High-Resolution Master Image
                  </label>
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[150px] relative ${
                      isDragging 
                        ? 'border-accent-gold bg-accent-gold/5' 
                        : 'border-border hover:border-accent-gold/50 bg-background/50'
                    }`}
                  >
                    <input
                      type="file"
                      required
                      disabled={isUploading}
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <CloudArrowUp size={30} className="text-text-secondary/50 mb-2" />
                    {file ? (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-accent-gold block truncate max-w-[280px] mx-auto">
                          {file.name}
                        </span>
                        <span className="text-[9px] text-text-secondary block">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-text-primary block">
                          Drag and drop artwork here or browse
                        </span>
                        <span className="text-[10px] text-text-secondary block">
                          PNG, JPG, or WEBP (Max 10MB)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Form buttons */}
              <div className="border-t border-border pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => router.push('/museum')}
                  className="px-5 py-2 rounded border border-border hover:bg-surface-elevated text-xs font-semibold text-text-secondary hover:text-text-primary transition-all uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className={`px-6 py-2 rounded font-semibold text-xs transition-all uppercase tracking-wider text-background ${
                    isUploading
                      ? 'bg-accent-gold/75 cursor-wait'
                      : 'bg-text-primary hover:opacity-90 shadow-md cursor-pointer'
                  }`}
                >
                  {isUploading ? 'Certifying...' : 'Certify & Split'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right side simulation & timeline (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Split Matrix Cut Simulator */}
          <div className="bg-surface p-6 border border-border rounded-lg space-y-4">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-widest border-b border-border pb-3">
              Fractionation Preview
            </h2>
            
            <div className="relative aspect-square w-full rounded bg-background border border-border overflow-hidden flex items-center justify-center">
              {imagePreview ? (
                <div className="relative w-full h-full">
                  <img
                    src={imagePreview}
                    alt="Artifact preview"
                    className="w-full h-full object-cover"
                  />
                  <div 
                    className="absolute inset-0 grid bg-white/5 dark:bg-black/15"
                    style={{
                      gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`
                    }}
                  >
                    {Array.from({ length: gridSize * gridSize }).map((_, i) => (
                      <div 
                        key={i} 
                        className="border-[0.5px] border-white/20 dark:border-black/20 hover:bg-accent-gold/20 transition-colors"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 space-y-2">
                  <FileImage size={32} className="text-text-secondary/30 mx-auto" />
                  <p className="text-xs text-text-secondary max-w-[180px] mx-auto">
                    Upload an asset to visualize live matrix divisions.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Vertical Stepper Timeline */}
          <AnimatePresence>
            {isUploading && (
              <motion.div 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-surface p-6 border border-border rounded-lg space-y-5"
              >
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-widest border-b border-border pb-3">
                  On-chain Sync Progress
                </h3>

                <div className="flex flex-col gap-6 relative pl-3 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-border">
                  
                  <div className="flex items-start gap-4 relative">
                    <div className="z-10 bg-surface rounded-full p-0.5">
                      {currentStep > 1 ? (
                        <CheckCircle size={16} weight="fill" className="text-accent-mint" />
                      ) : currentStep === 1 ? (
                        <Spinner size={16} className="text-accent-gold animate-spin" />
                      ) : (
                        <Circle size={16} className="text-text-secondary/40" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text-primary">1. Uploading Master Artifact</p>
                      <p className="text-[10px] text-text-secondary leading-relaxed">Uploading master asset CID parameters onto IPFS.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 relative">
                    <div className="z-10 bg-surface rounded-full p-0.5">
                      {currentStep > 2 ? (
                        <CheckCircle size={16} weight="fill" className="text-accent-mint" />
                      ) : currentStep === 2 ? (
                        <Spinner size={16} className="text-accent-gold animate-spin" />
                      ) : (
                        <Circle size={16} className="text-text-secondary/40" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text-primary">2. Anchoring Provenance NFT</p>
                      <p className="text-[10px] text-text-secondary leading-relaxed">Executing mintMasterNFT transaction on Ethereum.</p>
                      {txHash && (
                        <p className="text-[9px] font-mono text-accent-gold mt-1 truncate max-w-[200px]">
                          TX: {txHash}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-4 relative">
                    <div className="z-10 bg-surface rounded-full p-0.5">
                      {currentStep === 3 && initializedCount < totalFragments ? (
                        <Spinner size={16} className="text-accent-gold animate-spin" />
                      ) : currentStep === 3 && initializedCount >= totalFragments ? (
                        <CheckCircle size={16} weight="fill" className="text-accent-mint" />
                      ) : (
                        <Circle size={16} className="text-text-secondary/40" />
                      )}
                    </div>
                    <div className="flex-grow">
                      <p className="text-xs font-semibold text-text-primary">3. Initializing App-Chain Fragments</p>
                      <p className="text-[10px] text-text-secondary leading-relaxed">Mints coordinate tokens on private trading ledger.</p>
                      
                      {currentStep === 3 && (
                        <div className="mt-2 space-y-1">
                          <div className="w-full bg-text-secondary/15 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-accent-gold h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${(initializedCount / totalFragments) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] font-mono text-text-secondary">
                            <span>Mints Indexed:</span>
                            <span className="font-bold text-accent-gold">{initializedCount} / {totalFragments}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                <div className="mt-4 p-3 bg-background border border-border rounded font-mono text-[10px] text-accent-gold">
                  {stepStatus || 'Connecting node...'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* error box */}
          {errorMsg && (
            <div className="p-4 rounded border border-red-500/30 bg-red-500/5 text-red-500 text-xs font-mono relative flex flex-col gap-1">
              <button onClick={() => setErrorMsg(null)} className="absolute top-2.5 right-2.5 text-text-secondary hover:text-text-primary cursor-pointer">
                <X size={12} />
              </button>
              <p className="font-bold">Error:</p>
              <p className="break-all">{errorMsg}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
