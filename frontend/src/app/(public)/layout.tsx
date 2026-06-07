'use client';

import React from 'react';
import NavigationBar from '@/components/navigation-bar';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans antialiased">
      <NavigationBar />
      <main className="flex-grow w-full">
        {children}
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-text-secondary transition-colors bg-surface/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} iHeritage. All rights reserved. Digitize history, anchor provenance.</p>
        </div>
      </footer>
    </div>
  );
}
