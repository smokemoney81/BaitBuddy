import React, { useState, useMemo, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Store,
  Search,
  MapPin,
  Navigation,
  LocateFixed,
  Loader2,
  Crown,
  ChevronRight,
  Package
} from "lucide-react";
import PageContainer from '@/components/layout/PageContainer';
import { usePredictivePrefetch } from '@/hooks/usePredictivePrefetch';
import angelshops from '@/data/angelshops.json';
import { UsedGearMarketInner } from '@/pages/UsedGear';

const PAGE_SIZE = 24;

// Luftlinie zwischen zwei Koordinaten in Kilometern (Haversine).
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nur Läden mit gültigen Koordinaten sind für Distanz/Route brauchbar.
const SHOPS = angelshops.filter(
  (s) => s?.coordinates && s.coordinates.lat != null && s.coordinates.lng != null
);

// Angelshop-Finder Section
function AngelshopFinderContent() {
  const [query, setQuery] = useState('');
  const [userPos, setUserPos] = useState(null);
  const [locState, setLocState] = useState('idle');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocState('denied');
      return;
    }
    setLocState('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocState('ready');
      },
      () => setLocState('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  const shops = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = SHOPS;
    if (q) {
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.city?.toLowerCase().includes(q) ||
          s.street?.toLowerCase().includes(q)
      );
    }
    if (userPos) {
      list = list
        .map((s) => ({
          ...s,
          _dist: haversineKm(userPos.lat, userPos.lng, s.coordinates.lat, s.coordinates.lng),
        }))
        .sort((a, b) => a._dist - b._dist);
    } else {
      list = [...list].sort((a, b) =>
        (a.city || '').localeCompare(b.city || '', 'de') ||
        (a.name || '').localeCompare(b.name || '', 'de')
      );
    }
    return list;
  }, [query, userPos]);

  const shown = shops.slice(0, visible);

  const routeUrl = (shop) =>
    `https://www.google.com/maps/dir/?api=1&destination=${shop.coordinates.lat},${shop.coordinates.lng}`;

  return (
    <div className="space-y-6">
      <div className="bb-card">
        <div className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--bb-muted)' }} />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
                placeholder="Nach Laden, Stadt oder Straße suchen"
                className="pl-9 bg-gray-900/60 border-gray-700 text-white placeholder:text-gray-500"
                aria-label="Angelladen suchen"
              />
            </div>
            <button
              onClick={requestLocation}
              disabled={locState === 'loading'}
              className="bb-action shrink-0"
            >
              {locState === 'loading'
                ? <Loader2 size={16} className="mr-2 animate-spin" />
                : <LocateFixed size={16} className="mr-2" />}
              {locState === 'ready' ? 'Standort aktualisieren' : 'Läden in der Nähe'}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--bb-muted)' }}>
            <span>{shops.length} Angelläden gefunden</span>
            {locState === 'denied' && (
              <span className="text-amber-400">
                Standort nicht verfügbar – Sortierung nach Stadt.
              </span>
            )}
            {locState === 'ready' && (
              <span className="text-emerald-400">Nach Entfernung sortiert.</span>
            )}
          </div>
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((shop) => (
            <div
              key={shop.id}
              className="bb-card hover:border-cyan-600/50 transition-colors"
            >
              <div className="p-4 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-cyan-500/15 flex items-center justify-center shrink-0">
                    <Store size={20} style={{ color: 'var(--bb-cyan)' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-semibold leading-tight truncate">{shop.name}</h3>
                    <div className="text-sm flex items-center gap-1 mt-1" style={{ color: 'var(--bb-muted)' }}>
                      <MapPin size={14} className="shrink-0" />
                      <span className="truncate">
                        {[shop.street, shop.city].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  </div>
                  {shop._dist != null && (
                    <span className="bb-pill-info text-xs shrink-0" style={{ background: 'rgba(16,185,129,.2)', color: '#34d399', border: '1px solid rgba(16,185,129,.3)' }}>
                      {shop._dist < 10 ? shop._dist.toFixed(1) : Math.round(shop._dist)} km
                    </span>
                  )}
                </div>
                <a
                  href={routeUrl(shop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto"
                >
                  <button
                    className="bb-secondary w-full"
                  >
                    <Navigation size={16} className="mr-2" />
                    Route planen
                  </button>
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12" style={{ color: 'var(--bb-muted)' }}>
          Keine Angelläden für „{query}" gefunden.
        </div>
      )}

      {visible < shops.length && (
        <div className="text-center">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="bb-secondary"
          >
            Weitere Läden laden
          </button>
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  usePredictivePrefetch('Shop');

  return (
    <PageContainer maxWidth="max-w-6xl" enableSwipeRefresh={false}>
      <div className="space-y-8">

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--bb-cyan)' }}>
            BaitBuddy Shop
          </h1>
          <p style={{ color: 'var(--bb-muted)' }}>
            Angelläden, Gebrauchtmarkt und alles, was du für dein nächstes Abenteuer brauchst.
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="shops" className="w-full">
          <TabsList className="grid w-full grid-cols-2" style={{ background: 'var(--bb-surface)', border: '1px solid var(--bb-border)' }}>
            <TabsTrigger value="shops" className="data-[state=active]:bg-cyan-600">
              <Store size={16} className="mr-2" />
              Angelläden
            </TabsTrigger>
            <TabsTrigger value="used" className="data-[state=active]:bg-cyan-600">
              <Package size={16} className="mr-2" />
              Gebrauchtmarkt
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shops" className="mt-6">
            <AngelshopFinderContent />
          </TabsContent>

          <TabsContent value="used" className="mt-6">
            <UsedGearMarketInner />
          </TabsContent>
        </Tabs>

        {/* Premium CTA */}
        <div className="bb-card" style={{ borderColor: 'rgba(6,182,212,.3)', background: 'linear-gradient(to bottom right, rgba(6,182,212,.1), rgba(59,130,246,.1))' }}>
          <div className="p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <Crown size={24} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--bb-cyan)' }}>
                BaitBuddy Premium
              </h3>
              <p className="text-gray-300 text-sm">
                Schalte alle KI-Features, Geräteintegration und erweiterte Analysen frei.
              </p>
            </div>
            <a
              href="/Premium"
              className="inline-flex items-center px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors shrink-0"
            >
              Zu Premium
              <ChevronRight size={16} className="ml-1" />
            </a>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
