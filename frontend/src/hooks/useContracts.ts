'use client';

import { useChainId } from 'wagmi';
import { CONTRACT_ADDRESSES, SupportedChainId } from '../config/contracts';

export function useContracts() {
  const chainId = useChainId();

  // If the current chain is supported, return its mapping; otherwise fall back to local Anvil Private (9999)
  const activeChainId = (chainId in CONTRACT_ADDRESSES) 
    ? (chainId as SupportedChainId) 
    : 9999;

  return CONTRACT_ADDRESSES[activeChainId];
}
