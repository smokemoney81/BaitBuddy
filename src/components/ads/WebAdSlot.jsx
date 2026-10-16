import React, { useEffect, useRef, useState } from 'react';
import { getWebAdConfig, loadAdSense, subscribeAdConsent } from '@/lib/webAds';
import { trackAdEvent } from '@/lib/adAnalytics';

export default function WebAdSlot({ placement, userPlan }) {
  const config = getWebAdConfig();
  const [consent, setConsent] = useState(false);
  useEffect(() => config ? subscribeAdConsent(setConsent) : undefined, [config?.client, config?.slot]);
  if (!config || !consent) return null;
  return <ConsentedAd key={`${config.client}:${config.slot}`} config={config} placement={placement} userPlan={userPlan} />;
}

function ConsentedAd({ config, placement, userPlan }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = ref.current;
    let active = true;
    let loaded = false;
    const meta = { placement, user_plan: userPlan, ad_type: 'banner' };
    const observer = new MutationObserver(() => {
      if (node.dataset.adStatus === 'unfilled') setFailed(true);
      if (node.dataset.adStatus === 'filled' && !loaded) {
        loaded = true;
        trackAdEvent('ad_loaded', meta);
      }
    });
    observer.observe(node, { attributes: true, attributeFilter: ['data-ad-status'] });
    const request = () => {
      if (!active || node.getBoundingClientRect().width === 0 || node.dataset.bbRequested) return;
      trackAdEvent('ad_requested', meta);
      loadAdSense(config.client).then(() => {
        if (!active || node.dataset.bbRequested) return;
        node.dataset.bbRequested = 'true';
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }).catch(() => {
        if (active) { setFailed(true); trackAdEvent('ad_failed', meta); }
      });
    };
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(request) : null;
    resize?.observe(node);
    request();
    return () => { active = false; observer.disconnect(); resize?.disconnect(); };
  }, [config.client, placement, userPlan]);
  return (
    <aside aria-label="Anzeige" className="w-full bg-slate-900/80" style={{ display: failed ? 'none' : undefined }}>
      <div className="text-[10px] text-slate-500 px-4 pt-1">Anzeige</div>
      <ins ref={ref} className="adsbygoogle" style={{ display: 'block', minHeight: 100 }}
        data-ad-client={config.client} data-ad-slot={config.slot} data-ad-format="auto"
        data-full-width-responsive="true" />
    </aside>
  );
}
