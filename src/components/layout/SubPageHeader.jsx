import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useSound } from "@/components/utils/SoundManager";
import { useNavigationContext } from "@/lib/NavigationContext";

const PAGE_TITLES = {
  KiBuddyBeta: 'KI-Buddy',
  Weather: 'Wetter',
  Logbook: 'Fangbuch',
  Community: 'Community',
  TripPlanner: 'Ausflug planen',
  Gear: 'Ausruestung',
  Profile: 'Profil',
  Settings: 'Einstellungen',
  PremiumPlans: 'Premium',
  Map: 'Karte',
  Events: 'Events',
  CatchStats: 'Statistiken',
  Koeder3D: 'Koederfuehrung',
  Help: 'Hilfe',
  Tutorials: 'Anleitungen',
  Shop: 'Shop',
  AnglerMode: 'Anglermodus',
  LiveTripPage: 'Live-Trip',
};

export default function SubPageHeader({ title }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();
  const { isRootTab } = useNavigationContext();

  if (isRootTab) return null;

  const currentPage = location.pathname.replace(/^\//, '').split('/')[0] || 'Dashboard';
  const displayTitle = PAGE_TITLES[currentPage] || title || currentPage;

  const handleBack = () => {
    triggerHaptic('light');
    playSound('click');
    navigate(-1);
  };

  return (
    <div className="bb-subpage-header">
      <div className="bb-subpage-header-inner">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Zurueck"
          className="bb-header-icon-btn"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="bb-subpage-title">{displayTitle}</h1>
        <div style={{ width: 40, flexShrink: 0 }} aria-hidden="true" />
      </div>
    </div>
  );
}
