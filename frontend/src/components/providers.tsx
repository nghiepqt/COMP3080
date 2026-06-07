'use client';

import React from 'react';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { polygonAmoy, foundry } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';
import { WalletProvider } from '@/app/context/wallet-context';
import { ThemeProvider } from '@/components/theme-provider';

// Configure custom local chains for dual Anvil nodes
const anvilPublic = {
  ...foundry,
  id: 31338,
  name: 'Anvil Public Anchor',
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8547'] },
    public: { http: ['http://127.0.0.1:8547'] },
  },
};

const anvilPrivate = {
  ...foundry,
  id: 9999,
  name: 'Anvil Private Trading',
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8546'] },
    public: { http: ['http://127.0.0.1:8546'] },
  },
};

// Configure Wagmi
const config = createConfig({
  chains: [polygonAmoy, anvilPublic, anvilPrivate],
  connectors: [
    injected(),
  ],
  transports: {
    [polygonAmoy.id]: http(),
    [anvilPublic.id]: http(),
    [anvilPrivate.id]: http(),
  },
  ssr: true,
});

// React Query client
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <WalletProvider>
            {children}
          </WalletProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
