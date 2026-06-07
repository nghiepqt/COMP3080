'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import { useAccount, useDisconnect, useChainId, useConnect, useSignMessage, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { CONTRACT_ADDRESSES, SupportedChainId } from '../../config/contracts';

export type UserRole = 'admin' | 'collectorA' | 'collectorB';

export type AuthStatus = 
  | 'IDLE' 
  | 'CONNECTING_WALLET' 
  | 'CONNECTED_UNAUTH' 
  | 'FETCHING_NONCE' 
  | 'SIGNING_MESSAGE' 
  | 'VERIFYING_SIGNATURE' 
  | 'AUTHENTICATED' 
  | 'FAILED';

export interface RoleInfo {
  name: string;
  address: string;
  privateKey: string;
}

export const ROLES: Record<UserRole, RoleInfo> = {
  admin: {
    name: 'Museum Administrator',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  collectorA: {
    name: 'Collector Alice (A)',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  collectorB: {
    name: 'Collector Bob (B)',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
};

interface ContractMetadata {
  address: string;
  abi: any[];
}

interface ContractsResponse {
  MasterNFT: ContractMetadata;
  FragmentMarketplace: ContractMetadata;
}

interface WalletContextType {
  account: string | null;
  activeRole: UserRole;
  isLoading: boolean;
  isInitialized: boolean;
  contracts: ContractsResponse | null;
  publicProvider: ethers.JsonRpcProvider | null;
  privateProvider: ethers.JsonRpcProvider | null;
  jwtToken: string | null;
  authStatus: AuthStatus;
  authError: string | null;
  isLoggingIn: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  setAuthSession: (token: string, address: string, role: string) => void;
  loginUser: (role: 'collector' | 'museum') => Promise<void>;
  resetAuth: () => void;
  getPublicSigner: () => Promise<ethers.Signer | null>;
  getPrivateSigner: () => Promise<ethers.Signer | null>;
  fetchContracts: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const API_BASE = 'http://127.0.0.1:8000'; // FastAPI backend URL
const RPC_PUBLIC = 'http://127.0.0.1:8547';
const RPC_PRIVATE = 'http://127.0.0.1:8546';

// Cookie helpers
const setCookie = (name: string, value: string, days = 1) => {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "; expires=" + date.toUTCString();
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
};

const deleteCookie = (name: string) => {
  document.cookie = name + "=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
};

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

function decodeJwt(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1];
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  const [account, setAccount] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('admin');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [backendContracts, setBackendContracts] = useState<ContractsResponse | null>(null);
  const chainId = useChainId();

  const [authStatus, setAuthStatus] = useState<AuthStatus>('IDLE');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const contracts = useMemo(() => {
    if (!backendContracts) return null;

    const activeChain = (chainId === 31338 || chainId === 9999 || chainId === 80002) 
      ? (chainId as SupportedChainId) 
      : 9999;

    const addresses = CONTRACT_ADDRESSES[activeChain];

    return {
      MasterNFT: {
        address: addresses.MasterNFT,
        abi: backendContracts.MasterNFT.abi
      },
      FragmentMarketplace: {
        address: addresses.Marketplace,
        abi: backendContracts.FragmentMarketplace.abi
      }
    };
  }, [backendContracts, chainId]);
  const [jwtToken, setJwtToken] = useState<string | null>(null);

  const [publicProvider, setPublicProvider] = useState<ethers.JsonRpcProvider | null>(null);
  const [privateProvider, setPrivateProvider] = useState<ethers.JsonRpcProvider | null>(null);

  // Initialize providers
  useEffect(() => {
    try {
      const pubProv = new ethers.JsonRpcProvider(RPC_PUBLIC);
      const privProv = new ethers.JsonRpcProvider(RPC_PRIVATE);
      setPublicProvider(pubProv);
      setPrivateProvider(privProv);
    } catch (e) {
      console.error('Error initializing RPC providers:', e);
    }
  }, []);

  // Fetch contract configurations on mount
  useEffect(() => {
    fetchContracts();
  }, []);

  // Restore session from cookie on mount
  useEffect(() => {
    const token = getCookie('auth_token');
    if (token) {
      const payload = decodeJwt(token);
      if (payload && payload.address) {
        setAccount(payload.address);
        setJwtToken(token);
        setAuthStatus('AUTHENTICATED');
        
        // Restore activeRole based on address
        const addrLower = payload.address.toLowerCase();
        if (addrLower === ROLES.admin.address.toLowerCase()) {
          setActiveRole('admin');
        } else if (addrLower === ROLES.collectorB.address.toLowerCase()) {
          setActiveRole('collectorB');
        } else {
          setActiveRole('collectorA');
        }
      }
    }
    setIsInitialized(true);
  }, []);

  // Synchronize state with Wagmi connection and cookies
  useEffect(() => {
    if (isWagmiConnected && wagmiAddress) {
      const token = getCookie('auth_token');
      if (token) {
        const payload = decodeJwt(token);
        if (payload && payload.address && payload.address.toLowerCase() === wagmiAddress.toLowerCase()) {
          setAccount(wagmiAddress);
          setJwtToken(token);
          setAuthStatus('AUTHENTICATED');
          
          const role = payload.role;
          if (role === 'museum' || role === 'admin') {
            setActiveRole('admin');
          } else {
            const addrLower = wagmiAddress.toLowerCase();
            if (addrLower === ROLES.collectorB.address.toLowerCase()) {
              setActiveRole('collectorB');
            } else {
              setActiveRole('collectorA');
            }
          }
          return;
        }
      }
      setAccount(null);
      setJwtToken(null);
      setAuthStatus('CONNECTED_UNAUTH');
    } else if (!isWagmiConnected) {
      setAccount(null);
      setJwtToken(null);
      setAuthStatus('IDLE');
    }
  }, [wagmiAddress, isWagmiConnected]);

  const fetchContracts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/contracts`);
      if (res.ok) {
        const data = await res.json();
        setBackendContracts(data);
        console.log('Fetched contracts metadata successfully:', data);
      }
    } catch (e) {
      console.warn('Could not fetch contracts from backend. Ensure backend is running.', e);
    }
  };

  const setAuthSession = (token: string, address: string, role: string) => {
    setCookie('auth_token', token, 1);
    setJwtToken(token);
    setAccount(address);
    if (role === 'museum' || role === 'admin') {
      setActiveRole('admin');
    } else {
      const addrLower = address.toLowerCase();
      if (addrLower === ROLES.collectorB.address.toLowerCase()) {
        setActiveRole('collectorB');
      } else {
        setActiveRole('collectorA');
      }
    }
  };

  const connectWallet = async () => {
    setIsLoading(true);
    setAuthStatus('CONNECTING_WALLET');
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        await provider.send('eth_requestAccounts', []);
      }
    } catch (e) {
      console.error('Failed to connect wallet:', e);
      setAuthStatus('IDLE');
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setJwtToken(null);
    setAuthStatus('IDLE');
    deleteCookie('auth_token');
    wagmiDisconnect();
  };

  const loginUser = async (chosenRole: 'collector' | 'museum') => {
    setIsLoggingIn(true);
    setAuthStatus('CONNECTING_WALLET');
    setAuthError(null);
    try {
      // 1. Connect wallet if not connected
      let activeAddress = wagmiAddress;
      if (!isWagmiConnected || !activeAddress) {
        const result = await connectAsync({ connector: injected() });
        activeAddress = result.accounts[0];
      }
      
      setAuthStatus('CONNECTED_UNAUTH');

      // 2. Fetch Nonce
      setAuthStatus('FETCHING_NONCE');
      const nonceRes = await fetch(`${API_BASE}/api/auth/nonce?wallet=${activeAddress}`);
      if (!nonceRes.ok) {
        throw new Error("Failed to retrieve nonce from backend.");
      }
      const { nonce } = await nonceRes.json();

      // 3. Sign Message
      setAuthStatus('SIGNING_MESSAGE');
      const message = `Sign this message to log into iHeritage. Nonce: ${nonce}`;
      const signature = await signMessageAsync({ message });

      // 4. Verify Payload
      setAuthStatus('VERIFYING_SIGNATURE');
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: activeAddress,
          signature,
          nonce,
          chosen_role: chosenRole
        })
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.detail || "Authentication verification failed.");
      }

      const authData = await verifyRes.json();

      // 5. Save JWT and set session in context
      setAuthSession(authData.token, authData.address, authData.role);
      setAuthStatus('AUTHENTICATED');
    } catch (e: any) {
      console.error(e);
      setAuthStatus('FAILED');
      setAuthError(e.message || "Authentication failed.");
      throw e;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const resetAuth = () => {
    setAuthStatus(isWagmiConnected ? 'CONNECTED_UNAUTH' : 'IDLE');
    setAuthError(null);
  };

  const getPublicSigner = async (): Promise<ethers.Signer | null> => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      return await provider.getSigner();
    }
    return null;
  };

  const getPrivateSigner = async (): Promise<ethers.Signer | null> => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      return await provider.getSigner();
    }
    return null;
  };

  return (
    <WalletContext.Provider
      value={{
        account,
        activeRole,
        isLoading,
        isInitialized,
        contracts,
        publicProvider,
        privateProvider,
        jwtToken,
        authStatus,
        authError,
        isLoggingIn,
        connectWallet,
        disconnectWallet,
        setAuthSession,
        loginUser,
        resetAuth,
        getPublicSigner,
        getPrivateSigner,
        fetchContracts,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
