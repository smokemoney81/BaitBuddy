import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Brain, Map, CloudSun, BookOpen, MapPin, Wind, Gauge, Droplets, Backpack, CalendarDays } from 'lucide-react';
import { entities } from '@/api/frontendClient';
import { useLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { formatForecastTime, weatherDescription } from '@/lib/fishingConditions';
import BuddyCard from '@/components/buddy/BuddyCard';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

function DataError({ onRetry, children }) { return <div role="alert" className="bb-muted py-3"><p>{children}</p><button className="bb-secondary mt-2" type="button" onClick={onRetry}>Erneut versuchen</button></div>; }
export default function DashboardOverview({ user, nearestSpots = [] }) {
  const { currentLocation, requestGpsLocation } = useLocation();
  const conditions = useFishingConditions(currentLocation?.lat, currentLocation?.lon);
  const plans = useQuery({ queryKey: ['dashboard-plans-v2', user?.id], enabled: !!user, queryFn: () => entities.FishingPlan.list('-created_at'), staleTime: 60000 });
  const gear = useQuery({ queryKey: ['dashboard-gear-v2', user?.id], enabled: !!user, queryFn: () => entities.GearItem.list(), staleTime: 60000 });
  const nextTrip = (Array.isArray(plans.data) ? plans.data : []).filter(plan => plan.planned_date && Date.parse(plan.planned_date) > Date.now()).sort((a, b) => Date.parse(a.planned_date) - Date.parse(b.planned_date))[0];
  const gearItems = Array.isArray(gear.data) ? gear.data : [];
  const hours = conditions.hours.filter(row => row.time >= Date.now() - 3600000).slice(0, 12);
  const nextWindow = conditions.window;
  const timezone = conditions.data?.timezone;
  const weather = conditions.data?.current;
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const name = user?.nickname || user?.full_name?.split(' ')[0];
  const upcoming = nextTrip ? `Dein nächster Trip: ${nextTrip.title}, ${new Date(nextTrip.planned_date).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}. Lass uns deine Vorbereitung prüfen.` : nextWindow ? `Das günstigste Wetterfenster der nächsten 24 Stunden liegt bei ${formatForecastTime(nextWindow.start, timezone, true)}. Lass uns einen passenden Spot und deine Ausrüstung dazu finden.` : 'Wo, wann und womit möchtest du angeln? Ich helfe dir, deinen nächsten Ausflug vorzubereiten.';
  return <>
    <OnboardingFlow/>
    <header className="flex items-center justify-between gap-4"><div><p className="bb-eyebrow mb-2">Dein Tag am Wasser</p><h1 className="text-2xl font-semibold tracking-tight">{greeting}{name ? `, ${name}` : ''}.</h1><p className="bb-muted mt-1">Ein guter Ausflug beginnt mit einem guten Plan.</p></div></header>
    <section className="bb-card bb-hero">
      <img src="/assets/buddy/lake-hero.png" alt="" className="bb-hero-image" fetchPriority="high"/>
      <div className="flex items-center gap-2 text-xs text-cyan-100 mb-7"><MapPin size={14}/>{currentLocation?.name || (conditions.hasLocation ? 'An deinem Standort' : 'Bereit für neue Gewässer')}</div>
      <p className="text-slate-200 text-sm mb-2">Planen. Finden. Erleben.</p><h2 className="bb-title max-w-md">Dein nächster<br/>Angelausflug.</h2>
      <div className="flex items-center flex-wrap gap-5 mt-6 mb-6">
        {weather && <div className="flex items-center gap-3"><CloudSun className="text-cyan-200" size={30}/><div><strong className="text-xl">{Math.round(weather.temperature_2m)} °C</strong><p className="text-xs text-slate-300">{weatherDescription(weather.weather_code)}</p></div></div>}
        {nextWindow && <div><strong className="text-xl text-cyan-200">{nextWindow.index}<span className="text-sm text-slate-300"> / 100</span></strong><p className="text-xs text-slate-300">Biss-Index · Modellwert</p></div>}
        {conditions.isLoading && <p className="text-sm text-slate-300" role="status">Bedingungen werden geladen …</p>}
      </div>
      <Link className="bb-action self-start" to="/TripPlanner?new=1">Ausflug planen<ArrowRight size={18}/></Link>
    </section>
    <BuddyCard message={upcoming} question={nextTrip ? `Hilf mir mit Wetter und Ausrüstung für meinen nächsten Trip ${nextTrip.title}.` : 'Welche Spots, Wetterbedingungen und Ausrüstung passen zu meinem nächsten Angelausflug?'}/>
    <nav className="bb-quick-grid" aria-label="Dashboard-Schnellzugriffe">{[[Brain,'KI-Buddy','KiBuddyBeta'],[Map,'Karte','Map'],[CloudSun,'Wetter','Weather'],[BookOpen,'Fangbuch','Logbook']].map(([Icon,label,path]) => <Link key={path} to={`/${path}`}><Icon size={25}/><span>{label}</span></Link>)}</nav>
    <div className="bb-dashboard-columns">
      <section className="bb-card space-y-5"><div className="flex justify-between items-center"><h2 className="text-lg font-semibold">Wetter & Bissprognose</h2><Link to="/Weather" className="bb-secondary" aria-label="Alle Wetterdaten"><ArrowRight size={18}/></Link></div>
        {!conditions.hasLocation && <div><p className="bb-muted">Wähle deinen Standort für Wetter und Zeitfenster.</p><button type="button" onClick={requestGpsLocation} className="bb-secondary mt-3"><MapPin size={18}/>Standort verwenden</button></div>}
        {conditions.isError && <DataError onRetry={conditions.refetch}>Wetterdaten konnten gerade nicht geladen werden.</DataError>}
        {conditions.isLoading && <div className="h-36 rounded-xl bg-slate-800 animate-pulse" role="status" aria-label="Wetter wird geladen"/>}
        {weather && <>
          <div className="bb-stat-grid">{[[Wind,'Wind',`${Math.round(weather.wind_speed_10m)} km/h`],[Gauge,'Luftdruck',`${Math.round(weather.pressure_msl)} hPa`],[Droplets,'Niederschlag',`${weather.precipitation} mm`],[CloudSun,'Temperatur',`${Math.round(weather.temperature_2m)} °C`]].map(([Icon,label,value]) => <div key={label}><span className="text-xs text-slate-400 flex gap-2 items-center"><Icon size={14}/>{label}</span><strong className="block mt-2 text-lg">{value}</strong></div>)}</div>
          <div className="h-36 w-full min-w-0" role="img" aria-label="Stündlicher Verlauf des modellierten Biss-Index"><ResponsiveContainer width="100%" height="100%"><AreaChart data={hours}><XAxis dataKey="time" tickFormatter={time => formatForecastTime(time, timezone)} minTickGap={35} tick={{ fill:'#9caec3',fontSize:11 }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={time => formatForecastTime(time, timezone)} contentStyle={{ background:'#102238',border:0,borderRadius:12,color:'#fff' }}/><Area name="Biss-Index (Modell)" dataKey="index" type="monotone" stroke="#22d3ee" fill="#22d3ee" fillOpacity={.12} strokeWidth={2} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
          {nextWindow && <p className="text-sm text-cyan-200">Wetterfenster: {formatForecastTime(nextWindow.start, timezone, true)} – {formatForecastTime(nextWindow.end, timezone)}</p>}
          <p className="text-xs text-slate-400 leading-relaxed">Orientierung aus Temperatur, Wind, Regen, Bewölkung und Luftdruck. Keine gemessene Fangwahrscheinlichkeit. Zielfisch, Gewässer und Schonzeiten separat prüfen.</p>
        </>}
      </section>
      <div className="grid gap-5">
        <section className="bb-card"><h2 className="text-lg font-semibold mb-4">Top-Spots in deiner Nähe</h2><p className="text-xs text-slate-400 mb-3">Deine gespeicherten Spots, nach Entfernung sortiert.</p>{nearestSpots.length ? nearestSpots.map(spot => <Link to={`/Map?spot=${encodeURIComponent(spot.id)}`} className="flex items-center gap-3 py-3" key={spot.id}><div className="w-11 h-11 rounded-xl bg-cyan-400/10 grid place-items-center text-cyan-300"><MapPin size={21}/></div><div className="flex-1 min-w-0"><h3 className="font-semibold truncate">{spot.name}</h3><p className="text-xs text-slate-400">{spot.water_type}{spot.distance != null ? ` · ${spot.distance.toFixed(1)} km` : ''}</p></div><ArrowRight size={17}/></Link>) : <p className="bb-muted">Noch keine Spots in deiner Nähe geladen. Entdecke Gewässer auf der Karte und speichere deine Favoriten.</p>}<Link to="/Map" className="bb-secondary mt-3">Karte entdecken<ArrowRight size={16}/></Link></section>
        <section className="bb-card"><div className="flex items-center gap-3 mb-3"><Backpack className="text-cyan-300"/><h2 className="text-lg font-semibold">Meine Ausrüstung</h2></div>{gear.isError ? <DataError onRetry={gear.refetch}>Ausrüstung konnte nicht geladen werden.</DataError> : gear.isLoading ? <p role="status" className="bb-muted">Ausrüstung wird geladen …</p> : <><p className="bb-muted">{gearItems.length ? `${gearItems.length} Gegenstände hinterlegt. Stelle daraus die Packliste für deinen nächsten Ausflug zusammen.` : 'Noch keine Ausrüstung hinterlegt.'}</p><Link to="/Gear" className="bb-secondary mt-3">{gearItems.length ? 'Ausrüstung verwalten' : 'Ausrüstung hinzufügen'}<ArrowRight size={16}/></Link></>}</section>
      </div>
    </div>
    {plans.isError ? <DataError onRetry={plans.refetch}>Deine Trips konnten nicht geladen werden.</DataError> : <Link to="/TripPlanner" className="bb-card flex gap-4 items-center"><CalendarDays className="text-cyan-300"/><div className="flex-1"><h2 className="font-semibold">{nextTrip?.title || 'Noch kein Angelausflug geplant'}</h2><p className="bb-muted">{nextTrip ? new Date(nextTrip.planned_date).toLocaleString('de-DE') : 'Plane deinen ersten Ausflug mit deinem Buddy.'}</p></div><ArrowRight size={18}/></Link>}
  </>;
}
