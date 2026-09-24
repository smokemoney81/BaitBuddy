import React from 'react';
import { usePlan } from './PlanContext';
import PlanGuard from './PlanGuard';

// Wrapper für Abwärtskompatibilität - leitet auf PlanGuard um.
// Akzeptiert sowohl 'featureName' (neu) als auch 'feature' (alt).
export default function PremiumGuard({ children, requiredPlan = 'basic', fallback = null, featureName, feature, user: _user }) {
  return (
    <PlanGuard requiredPlan={requiredPlan} fallback={fallback} featureName={featureName || feature}>
      {children}
    </PlanGuard>
  );
}

export function useHasPlan(requiredPlan = 'basic') {
  const { hasFeature, loading } = usePlan();
  return { allowed: hasFeature(requiredPlan), loading };
}