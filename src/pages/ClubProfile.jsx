import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

// Compatibility route for links introduced by PR #477.
// The maintained club UI lives in Vereinsprofil and consumes the current clubs API.
export default function ClubProfile() {
  const { clubId } = useParams();
  if (!clubId) return <Navigate to="/Vereinsprofil" replace />;
  return <Navigate to={`/Vereinsprofil?id=${encodeURIComponent(clubId)}`} replace />;
}
