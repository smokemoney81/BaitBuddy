import React from 'react';
import SwipeToRefresh from '@/components/utils/SwipeToRefresh';

export default function PageContainer({
  children,
  className = '',
  maxWidth = 'max-w-7xl',
  enableSwipeRefresh = true,
  onRefresh = null,
  noBottomPadding = false
}) {
  const containerContent = (
    <div className={`${maxWidth} mx-auto px-4 ${!noBottomPadding ? 'pb-safe-fixed' : ''} ${className}`}>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen">
      {enableSwipeRefresh && onRefresh ? (
        <SwipeToRefresh onRefresh={onRefresh}>
          {containerContent}
        </SwipeToRefresh>
      ) : (
        containerContent
      )}
    </div>
  );
}