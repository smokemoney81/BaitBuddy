import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { entities } from "@/api/frontendClient";

export default function MyDepthDataList() {
  const [stats, setStats] = useState({ total: 0, waterBodies: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Jeder Upload ist ein Eintrag in bathymetric_maps (Name = Gewässer,
      // map_data.point_count/max_depth). Die Liste enthält auch öffentliche
      // Karten anderer — hier nur die eigenen Uploads (is_own), keine
      // Community-Karten. Für ältere Uploads ohne max_depth wird die Tiefe aus
      // den eigenen Messpunkten ermittelt.
      const [maps, points] = await Promise.all([
        entities.BathymetricMap.list('-created_at', 500),
        entities.DepthDataPoint.list('-created_at', 500),
      ]);
      const uploads = maps.filter((m) => m.is_own && m.map_data?.kind !== 'community');
      const pointDepthByMap = {};
      for (const p of points) {
        const depth = Number(p.depth_m);
        if (Number.isFinite(depth)) pointDepthByMap[p.map_id] = Math.max(pointDepthByMap[p.map_id] || 0, depth);
      }

      const byWater = {};
      let total = 0;
      for (const m of uploads) {
        const name = m.name || "Unbekannt";
        const count = Number(m.map_data?.point_count) || 0;
        const maxDepth = Number(m.map_data?.max_depth ?? pointDepthByMap[m.id]) || 0;
        if (!byWater[name]) byWater[name] = { count: 0, maxDepth: 0 };
        byWater[name].count += count;
        byWater[name].maxDepth = Math.max(byWater[name].maxDepth, maxDepth);
        total += count;
      }

      setStats({
        total,
        waterBodies: Object.entries(byWater).map(([name, data]) => ({ name, ...data }))
      });
    } catch (err) {
      console.error("Fehler beim Laden:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <Card className="glass-morphism border-gray-800">
        <CardContent className="p-4 text-center text-gray-400 text-sm">Lade deine Daten...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-morphism border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base">Meine Tiefendaten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm text-gray-300">{stats.total} Messpunkte insgesamt</div>
        
        {stats.waterBodies.length === 0 && (
          <div className="text-xs text-gray-500">Noch keine Daten hochgeladen. Lade Echolot-Daten hoch, um zur Community beizutragen.</div>
        )}

        {stats.waterBodies.map(wb => (
          <div key={wb.name} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2">
            <div>
              <div className="text-sm text-white">{wb.name}</div>
              <div className="text-xs text-gray-400">{wb.count} Punkte</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-cyan-400">{wb.maxDepth}m</div>
              <div className="text-xs text-gray-500">max. Tiefe</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}