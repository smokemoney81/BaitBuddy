import React from 'react';
import HeroImage from './HeroImage';
import CardHeader from './CardHeader';
import CardInfoRows from './CardInfoRows';
import CardActions from './CardActions';

function CardLayout({
  marker,
  markerType,
  heroImage,
  onImageError,
  imageError: _imageError,
  onAction
}) {
  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Hero Image */}
      <div className="relative h-56 sm:h-64 bg-gray-800 overflow-hidden">
        <HeroImage
          src={heroImage?.src}
          alt={heroImage?.alt}
          onError={onImageError}
          fallbacks={heroImage?.fallbacks}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 sm:p-6 space-y-4">
        {/* Header */}
        <CardHeader
          marker={marker}
          markerType={markerType}
        />

        {/* Info Rows */}
        {marker.infos && marker.infos.length > 0 && (
          <CardInfoRows infos={marker.infos} />
        )}

        {/* Description */}
        {marker.description && (
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
            {marker.description}
          </p>
        )}

        {/* Divider */}
        {marker.actions && marker.actions.length > 0 && (
          <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
        )}
      </div>

      {/* Actions */}
      {marker.actions && marker.actions.length > 0 && (
        <CardActions
          actions={marker.actions}
          onAction={onAction}
        />
      )}
    </div>
  );
}

export default CardLayout;
