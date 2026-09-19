import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { functions } from "@/api/frontendClient";

// Web-Checkout via Stripe: Karte, PayPal, SEPA Lastschrift, Klarna
export default function WebCheckoutButton({ planId, disabled }) {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const handleClick = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const response = await functions.invoke('createStripeCheckoutSession', {
        plan_id: planId
      });

      // Der API-Client liefert die JSON-Antwort flach zurück (kein .data-Wrapper).
      const data = response?.data ?? response;
      const checkoutUrl = data?.checkout_url;
      if (!checkoutUrl) {
        throw new Error(data?.error || 'Checkout-Session konnte nicht erstellt werden.');
      }

      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error('Checkout fehlgeschlagen', {
        description: error?.message || 'Unbekannter Fehler'
      });
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || loading}
      variant="outline"
      className="w-full border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10 flex items-center justify-center gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Weiterleitung...
        </>
      ) : (
        <>
          <CreditCard className="w-4 h-4" />
          Karte / Google Pay / Apple Pay
        </>
      )}
    </Button>
  );
}