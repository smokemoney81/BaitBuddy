import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Crown, ArrowRight } from 'lucide-react';
import { usePlan } from './PlanContext';

const PLAN_LABELS = {
  basic: 'Basic',
  pro: 'Pro',
  elite: 'Ultimate',
  ultimate: 'Ultimate',
  friends_monthly: 'Freundschaft',
  friends: 'Freundschaft'
};

export default function PlanGuard({ children, requiredPlan = 'basic', fallback = null, featureName }) {
  const { hasFeature, loading } = usePlan();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const allowed = hasFeature(requiredPlan);

  if (allowed) {
    return children;
  }

  if (fallback) return fallback;

  const planLabel = PLAN_LABELS[requiredPlan] || requiredPlan;

  return (
    <section className="bb-card bb-lock-card" aria-labelledby="bb-lock-title">
      <span className="bb-lock-icon"><Lock size={30} aria-hidden="true" /></span>
      <h2 id="bb-lock-title" className="bb-lock-title">
        {featureName ? `${featureName} ist gesperrt` : 'Diese Funktion ist gesperrt'}
      </h2>
      <p className="bb-lock-plan">
        <Crown size={16} aria-hidden="true" />
        Ab dem {planLabel}-Tarif verfügbar
      </p>
      <Link to="/PremiumPlans" className="bb-action bb-action-block">
        <Crown size={20} aria-hidden="true" className="bb-action-icon" />
        <span>Tarif ansehen</span>
        <ArrowRight size={20} aria-hidden="true" className="bb-action-arrow" />
      </Link>
    </section>
  );
}
