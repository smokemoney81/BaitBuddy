import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useSound } from "@/components/utils/SoundManager";
import { useNavigationContext } from "@/lib/NavigationContext";

export default function SubPageHeader({ title }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();
  const { isRootTab } = useNavigationContext();

  if (isRootTab) return null;

  const currentPage = location.pathname.replace(/^\//, '').split('/')[0] || 'Dashboard';

  const handleBack = () => {
    triggerHaptic('light');
    playSound('click');
    navigate(-1);
  };

  return (
    <div
      className="md:hidden sticky top-0 z-40"
      style={{
        background: 'rgba(6,14,24,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,229,255,0.12)',
      }}
    >
      <div
        className="flex items-center h-14 px-3 gap-2"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Zurueck"
          className="bb-back-btn flex-shrink-0"
          style={{ minWidth: 40, minHeight: 40 }}
        >
          <ArrowLeft aria-hidden="true" className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-white">
          {title || currentPage}
        </h1>
        {/* Spacer to balance left button */}
        <div style={{ width: 40, flexShrink: 0 }} />
      </div>
    </div>
  );
}