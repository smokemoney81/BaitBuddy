import React, { useState, useEffect } from "react";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { generateBathymetricMap } from "@/functions/generateBathymetricMap";
import { Input } from "@/components/ui/input";
import DepthUploadPanel from "@/components/depth/DepthUploadPanel";
import BathymetricMapCard from "@/components/depth/BathymetricMapCard";
import MyDepthDataList from "@/components/depth/MyDepthDataList";
import { toast } from "sonner";
import TabBar from "@/components/layout/TabBar";
import PremiumGuard from "@/components/premium/PremiumGuard";

const bathyTabs = [
  { key: "maps", label: "Community-Karten" },
  { key: "upload", label: "Daten hochladen" },
  { key: "mine", label: "Meine Daten" },
];

export default function BathymetricCrowdsourcing() {
  return (
    <PremiumGuard requiredPlan="pro" feature="Tiefenkarten & Bathymetrie-Crowdsourcing">
      <BathymetricCrowdsourcingInner />
    </PremiumGuard>
  );
}

function BathymetricCrowdsourcingInner() {
  const [maps, setMaps] = useState([]);
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [user, setUser] = useState(null);
  const [newWaterBody, setNewWaterBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("maps");

  useEffect(() => {
    loadUser();
    loadMaps();
  }, []);

  const loadUser = async () => {
    try {
      const u = await auth.me();
      setUser(u);
    } catch {
      setUser(null);
    }
  };

  const loadMaps = async () => {
    setLoadingMaps(true);
    try {
      // Community-Karten (von POST /api/water/bathymetric-map berechnet) —
      // einzelne Uploads stehen unter „Meine Daten“. Die Kennzahlen liegen in
      // map_data und werden für die Kartenanzeige flach gezogen.
      const data = await entities.BathymetricMap.list('-created_at', 200);
      setMaps(
        data
          .filter((row) => row?.map_data?.kind === 'community')
          .map((row) => ({
            ...row.map_data,
            id: row.id,
            water_body_name: row.name,
            status: row.map_data?.status || 'ready',
          }))
      );
    } catch {
      toast.error('Fehler beim Laden der Karten');
    } finally {
      setLoadingMaps(false);
    }
  };

  const handleGenerateNew = async () => {
    if (!newWaterBody.trim()) return toast.error("Gewaessernamen eingeben");
    setGenerating(true);
    try {
      await generateBathymetricMap({ water_body_name: newWaterBody.trim() });
      toast.success("Karte wird berechnet, dies dauert einen Moment");
      setNewWaterBody("");
      setTimeout(loadMaps, 3000);
    } catch (err) {
      toast.error("Fehler: " + err.message);
    }
    setGenerating(false);
  };

  const isAdmin = user?.is_admin === true;

  return (
    <div className="bb-page">
      <h1 className="text-2xl font-bold text-white">Bathymetrisches Crowdsourcing</h1>
      <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
        Teile deine Echolot-Daten und profitiere von praezisen Community-Tiefenkarten
      </p>

      <TabBar tabs={bathyTabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "maps" && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex gap-2">
              <Input
                value={newWaterBody}
                onChange={e => setNewWaterBody(e.target.value)}
                placeholder="Gewaessername fuer neue Karte..."
                className="bg-gray-900 border-gray-700 text-white"
                onKeyDown={e => e.key === 'Enter' && handleGenerateNew()}
              />
              <button
                onClick={handleGenerateNew}
                disabled={generating}
                className="bb-action whitespace-nowrap"
              >
                {generating ? "Berechnet..." : "Karte erstellen"}
              </button>
            </div>
          )}

          {loadingMaps ? (
            <div className="text-center py-10" style={{ color: 'var(--bb-muted)' }}>Karten werden geladen...</div>
          ) : maps.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--bb-muted)' }}>
              <div className="text-base text-white mb-2">Noch keine Community-Karten vorhanden</div>
              <p className="text-sm">Lade Echolot-Daten hoch und erstelle die erste Tiefenkarte fuer dein Gewaesser.</p>
            </div>
          ) : (
            maps.map(map => (
              <BathymetricMapCard
                key={map.id}
                map={map}
                onRegenerate={loadMaps}
                isAdmin={isAdmin}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "upload" && (
        <div className="space-y-4">
          <DepthUploadPanel onUploadSuccess={loadMaps} />
          <div className="bb-card text-xs space-y-2" style={{ color: 'var(--bb-muted)' }}>
            <div className="font-medium text-white">CSV-Format Beispiel:</div>
            <pre className="font-mono" style={{ color: 'rgba(255,255,255,.35)' }}>
{`latitude,longitude,depth
52.4567,13.2890,8.5
52.4568,13.2891,9.2
52.4569,13.2892,10.1`}
            </pre>
            <div className="font-medium text-white mt-2">GPX-Format:</div>
            <p>GPX-Dateien mit Tiefendaten aus kompatiblen Echoloten werden automatisch erkannt.</p>
          </div>
        </div>
      )}

      {activeTab === "mine" && (
        <MyDepthDataList />
      )}
    </div>
  );
}
