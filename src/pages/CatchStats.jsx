import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Catch } from "@/entities/Catch";
import { Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { Fish, Weight, Trophy, Hash } from "lucide-react";

const COLORS = [
  "#22d3ee", "#10b981", "#f59e0b", "#a78bfa", "#f87171",
  "#34d399", "#fb923c", "#60a5fa", "#e879f9", "#4ade80"
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white shadow-xl">
      <p className="font-semibold text-cyan-400">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function CatchStatsContent() {
  // Gleicher Query-Key wie das Fangbuch (geteilter Cache) — daher identisches
  // Limit, damit die Statistik unabhängig von der Mount-Reihenfolge alle Fänge
  // auswertet und nicht beim Backend-Default von 50 gedeckelt wird.
  const { data: catches = [], isLoading } = useQuery({
    queryKey: ["catches"],
    queryFn: () => Catch.list("-catch_time", 1000),
  });

  const stats = useMemo(() => {
    if (!catches.length) return null;

    // Faenge pro Fischart
    const bySpecies = {};
    catches.forEach((c) => {
      const s = c.species || "Unbekannt";
      if (!bySpecies[s]) bySpecies[s] = { count: 0, totalWeight: 0, maxWeight: 0, catches: [] };
      bySpecies[s].count++;
      if (c.weight_kg) {
        bySpecies[s].totalWeight += c.weight_kg;
        if (c.weight_kg > bySpecies[s].maxWeight) bySpecies[s].maxWeight = c.weight_kg;
      }
      bySpecies[s].catches.push(c);
    });

    // Gesamtzahl der Arten vor dem Top-10-Slice festhalten — die Kennzahl
    // "Arten" darf nicht auf 10 gedeckelt werden, nur das Diagramm zeigt Top 10.
    const speciesCount = Object.keys(bySpecies).length;

    const speciesCountData = Object.entries(bySpecies)
      .map(([name, d]) => ({ name, count: d.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const speciesWeightData = Object.entries(bySpecies)
      .filter(([, d]) => d.totalWeight > 0)
      .map(([name, d]) => ({
        name,
        gesamtgewicht: parseFloat(d.totalWeight.toFixed(2)),
        maxGewicht: parseFloat(d.maxWeight.toFixed(2)),
      }))
      .sort((a, b) => b.gesamtgewicht - a.gesamtgewicht)
      .slice(0, 10);

    // Faenge pro Monat
    const byMonth = {};
    catches.forEach((c) => {
      if (!c.catch_time) return;
      const d = new Date(c.catch_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth[key] = (byMonth[key] || 0) + 1;
    });
    const monthlyData = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, count]) => ({ month, count }));

    // Koeder-Auswertung
    const byBait = {};
    catches.forEach((c) => {
      if (!c.bait_used) return;
      byBait[c.bait_used] = (byBait[c.bait_used] || 0) + 1;
    });
    const baitData = Object.entries(byBait)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Kennzahlen
    const withWeight = catches.filter((c) => c.weight_kg);
    const totalWeight = withWeight.reduce((s, c) => s + c.weight_kg, 0);
    const maxCatch = catches.reduce((best, c) => (!best || (c.weight_kg || 0) > (best.weight_kg || 0) ? c : best), null);

    return { speciesCount, speciesCountData, speciesWeightData, monthlyData, baitData, totalWeight, maxCatch, withWeight };
  }, [catches]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!catches.length) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center text-gray-400 mt-20">
        <p className="text-xl font-semibold text-white mb-2">Noch keine Faenge erfasst</p>
        <p>Trage deinen ersten Fang im Fangbuch ein, um hier Statistiken zu sehen.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 pb-safe-fixed">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--bb-cyan)' }}>
        Fang-Statistiken
      </h1>

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Fänge gesamt", value: catches.length, Icon: Hash, color: "text-cyan-400", bg: "from-cyan-900/30 to-cyan-900/10", border: "border-cyan-800/40" },
          { label: "Arten", value: stats?.speciesCount, Icon: Fish, color: "text-emerald-400", bg: "from-emerald-900/30 to-emerald-900/10", border: "border-emerald-800/40" },
          {
            label: "Gesamtgewicht",
            value: stats?.totalWeight ? `${stats.totalWeight.toFixed(1)} kg` : "—",
            Icon: Weight, color: "text-blue-400", bg: "from-blue-900/30 to-blue-900/10", border: "border-blue-800/40"
          },
          {
            label: "Größter Fang",
            value: stats?.maxCatch?.weight_kg
              ? `${stats.maxCatch.weight_kg} kg`
              : stats?.maxCatch?.species || "—",
            Icon: Trophy, color: "text-amber-400", bg: "from-amber-900/30 to-amber-900/10", border: "border-amber-800/40"
          },
        ].map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} className={`rounded-xl bg-gradient-to-br ${bg} border ${border} p-4 text-center`}>
            <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
            <p className="text-xs mb-1" style={{ color: 'var(--bb-muted)' }}>{label}</p>
            <p className={`text-lg font-bold ${color} leading-tight`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Faenge nach Art */}
      <div className="bb-card">
        <div className="text-base font-bold text-white mb-4">Faenge nach Fischart</div>
        <div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats?.speciesCountData} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Anzahl" radius={[4, 4, 0, 0]}>
                {stats?.speciesCountData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gewicht nach Art */}
      {stats?.speciesWeightData.length > 0 && (
        <div className="bb-card">
          <div className="text-base font-bold text-white mb-4">Gewicht nach Fischart (kg)</div>
          <div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.speciesWeightData} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="gesamtgewicht" name="Gesamtgewicht (kg)" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                <Bar dataKey="maxGewicht" name="Max. Einzelfang (kg)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Monatliche Aktivitaet */}
      {stats?.monthlyData.length > 1 && (
        <div className="bb-card">
          <div className="text-base font-bold text-white mb-4">Monatliche Aktivitaet</div>
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.monthlyData} margin={{ top: 4, right: 8, left: -10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Faenge" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Koeder-Verteilung */}
      {stats?.baitData.length > 0 && (
        <div className="bb-card">
          <div className="text-base font-bold text-white mb-4">Koeder-Verteilung</div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.baitData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: "#6b7280" }}
                >
                  {stats.baitData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatchStats() {
  return (
    <div className="bb-page">
      {/* Fang-Statistiken sind laut Plan eine Free-Funktion. */}
      <CatchStatsContent />
    </div>
  );
}