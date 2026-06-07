'use client';

import React from 'react';
import ArtworkDetail from '@/app/components/ArtworkDetail';

export default function CollectorArtworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <ArtworkDetail artworkId={id} />;
}
