import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startGooglePlayPurchase, isGooglePlayBillingAvailable } from "@/components/premium/googlePlayBilling";

const STORAGE_KEY = "catchgbt_trial_offer_dismissed";
const DISMISS_HOURS = 24;
const TRIAL_PLAN_ID = "trial_10_10";

export default function TrialOfferPopup({ currentPlan, onPurchaseSuccess }) {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!currentPlan || currentPlan.id !== "free") return;

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const hoursSince = (Date.now() - dismissedAt) / (1000 * 60 * 60);
      if (hoursSince < DISMISS_HOURS) return;
    }

    const timer = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(timer);
  }, [currentPlan]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setOpen(false);
  };

  const handlePurchase = async () => {
    if (!isGooglePlayBillingAvailable()) {
      toast.error("Käufe nur in der Android-App", {
        description: "Bitte nutze die BaitBuddy Android-App im Play Store."
      });
      return;
    }

    setProcessing(true);
    try {
      const result = await startGooglePlayPurchase(TRIAL_PLAN_ID);

      if (result.success && result.activated) {
        toast.success("10-Tage-Zugang aktiviert", {
          description: "Alle Premium-Funktionen sind jetzt 10 Tage freigeschaltet."
        });
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        setOpen(false);
        if (onPurchaseSuccess) onPurchaseSuccess();
        window.dispatchEvent(new CustomEvent("plan-updated"));
      } else if (result.cancelled) {
        toast.info("Kauf abgebrochen");
      } else {
        toast.error("Kauf nicht möglich", {
          description: result.error || "Unbekannter Fehler"
        });
      }
    } catch (error) {
      toast.error("Fehler", { description: error.message });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-gray-950 border-2 border-amber-500/50 max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold uppercase tracking-wider">
            Limitiertes Angebot
          </div>
          <DialogTitle className="text-2xl text-center text-white">
            Alle Premium-Funktionen testen
          </DialogTitle>
          <DialogDescription className="text-center text-gray-400 pt-2">
            Schalte für 10 Tage alle Funktionen frei und entdecke das volle Potenzial von BaitBuddy.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center">
          <div className="inline-flex items-baseline gap-2">
            <span className="text-5xl font-bold text-white">10</span>
            <span className="text-2xl text-gray-400">Euro</span>
          </div>
          <div className="text-sm text-amber-400 mt-1">für 10 Tage Vollzugriff</div>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-2 text-sm text-gray-300">
          <div>KI-Buddy Chat ohne Tageslimit</div>
          <div>KI-Foto-Analyse aller Fänge</div>
          <div>Gewässeranalyse mit Messwerten</div>
          <div>Fangprognosen</div>
          <div>AR-Gewässer-Ansicht 3D</div>
          <div>Voice Control: Hey Buddy</div>
          <div>Live-Bissanzeiger & CatchCam</div>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <Button
            onClick={handlePurchase}
            disabled={processing}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-white font-semibold py-6 text-base"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Wird verarbeitet...
              </>
            ) : (
              "Jetzt für 10 EUR freischalten"
            )}
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            className="text-gray-500 hover:text-gray-300"
          >
            Vielleicht später
          </Button>
        </div>

        <p className="text-[10px] text-center text-gray-600 pt-2">
          Einmalzahlung über Google Play. Endet automatisch nach 10 Tagen.
        </p>
      </DialogContent>
    </Dialog>
  );
}