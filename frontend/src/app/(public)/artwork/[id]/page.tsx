'use client';

import React from 'react';
import ArtworkDetail from '@/app/components/ArtworkDetail';

export default function ArtworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ArtworkDetail artworkId={id} />
    </div>
  );
}
