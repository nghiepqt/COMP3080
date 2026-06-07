import React from 'react';
import type { Metadata } from 'next';
import { Cormorant_Garamond, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import NetworkGuard from '@/app/components/NetworkGuard';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'iHeritage - Fractional Heritage NFT Marketplace',
  description: 'Digitize cultural heritage into tradeable coordinate fragments with dual-chain blockchain provenance.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${plusJakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <Providers>
          <NetworkGuard>
            {children}
          </NetworkGuard>
        </Providers>
      </body>
    </html>
  );
}
