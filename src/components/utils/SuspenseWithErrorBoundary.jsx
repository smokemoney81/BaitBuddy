import React, { Suspense } from 'react';
import ErrorBoundary from '@/lib/ErrorBoundary';

export default function SuspenseWithErrorBoundary({ 
  children, 
  fallback = <div className="p-4 text-center text-gray-500">Laden...</div>,
  errorFallback: _errorFallback = null,
  isMinimal = false,
  onError = null
}) {
  const handleError = (error) => {
    if (onError) onError(error);
  };

  return (
    <ErrorBoundary 
      isMinimal={isMinimal}
      isFull={false}
      onError={handleError}
    >
      <Suspense fallback={fallback || <div className="p-4 text-center text-gray-500">Laden...</div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}