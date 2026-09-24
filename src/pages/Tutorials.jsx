import React from "react";
import { MonitorPlay, Youtube, Info, Sparkles, Volume2 } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import PageTitle from "@/components/layout/PageTitle";

export default function Tutorials() {
  return (
    <div className="bb-page">
      <div className="max-w-4xl mx-auto space-y-6">

        <PageTitle title="BaitBuddy Tutorials" subtitle="Lerne alles über BaitBuddy mit interaktiven Anleitungen." />

        <Carousel className="w-full max-w-xs mx-auto md:max-w-md lg:max-w-2xl">
          <CarouselContent>

            <CarouselItem>
              <div className="bb-card h-full flex flex-col justify-between min-h-[500px]" style={{ borderColor: 'rgba(6,182,212,0.3)', background: 'linear-gradient(to bottom right, rgba(6,182,212,0.1), rgba(59,130,246,0.1))' }}>
                <div>
                  <div className="bb-form-title flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
                    <Youtube size={24} />
                    Willkommen zu den Tutorials
                  </div>
                </div>
                <div className="grid gap-4 flex-grow mt-4">
                  <p className="text-base leading-relaxed" style={{ color: '#d1d5db' }}>
                    Hier findest du interaktive Anleitungen, um das Beste aus deiner BaitBuddy App herauszuholen.
                    Wische nach rechts, um fortzufahren und die wichtigsten Funktionen kennenzulernen.
                  </p>
                  <div className="text-center py-4">
                    <Sparkles size={48} className="mx-auto animate-pulse" style={{ color: '#c084fc' }} />
                  </div>
                </div>
                <div className="pt-0 text-center text-sm" style={{ color: 'var(--bb-muted)' }}>
                  <Info size={16} className="inline-block mr-1" />
                  Wische nach links oder rechts um zu navigieren
                </div>
              </div>
            </CarouselItem>

            <CarouselItem>
              <div className="bb-card h-full flex flex-col justify-between min-h-[500px]" style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'linear-gradient(to bottom right, rgba(16,185,129,0.1), rgba(34,197,94,0.1))' }}>
                <div>
                  <div className="bb-form-title flex items-center gap-2" style={{ color: '#34d399' }}>
                    <Volume2 size={24} />
                    Vorlesefunktion
                  </div>
                </div>
                <div className="grid gap-6 flex-grow mt-4">
                  <div className="rounded-lg p-4" style={{ background: 'rgba(6,78,59,0.3)', border: '1px solid rgba(5,150,105,0.5)' }}>
                    <h4 className="font-semibold mb-3 text-lg" style={{ color: '#6ee7b7' }}>Was ist die Vorlesefunktion?</h4>
                    <p className="text-base leading-relaxed" style={{ color: '#d1d5db' }}>
                      Die App kann dir Texte laut vorlesen. Dies funktioniert automatisch beim KI-Buddy,
                      wenn du Sprachsteuerung aktiviert hast.
                    </p>
                  </div>

                  <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
                    <h4 className="font-semibold mb-3" style={{ color: '#6ee7b7' }}>So aktivierst du die Vorlesefunktion:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-base" style={{ color: '#d1d5db' }}>
                      <li>Öffne die Einstellungen</li>
                      <li>Gehe zu Voice-Einstellungen</li>
                      <li>Aktiviere Audio-Ausgabe</li>
                      <li>Wähle deine bevorzugte Stimme und Geschwindigkeit</li>
                    </ol>
                  </div>

                  <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
                    <h4 className="font-semibold mb-2" style={{ color: '#6ee7b7' }}>Wo funktioniert es?</h4>
                    <p className="text-base" style={{ color: '#d1d5db' }}>
                      Die Vorlesefunktion ist verfügbar im KI-Chat-Buddy. Wenn aktiviert,
                      werden die Antworten des KI-Buddys automatisch vorgelesen.
                    </p>
                  </div>
                </div>
                <div className="pt-0 text-center text-sm" style={{ color: 'var(--bb-muted)' }}>
                  <Info size={16} className="inline-block mr-1" />
                  Wische nach links oder rechts um zu navigieren
                </div>
              </div>
            </CarouselItem>

            <CarouselItem>
              <div className="bb-card h-full flex flex-col justify-between min-h-[500px]" style={{ borderColor: 'rgba(6,182,212,0.3)', background: 'linear-gradient(to bottom right, rgba(6,182,212,0.1), rgba(59,130,246,0.1))' }}>
                <div>
                  <div className="bb-form-title flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
                    <MonitorPlay size={24} />
                    Umfassende Funktionen
                  </div>
                </div>
                <div className="grid gap-4 flex-grow mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--bb-cyan)' }}>Umfassende Anleitungen</h4>
                      <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                        Schritt-für-Schritt Tutorials für jede Funktion
                      </p>
                    </div>
                    <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--bb-cyan)' }}>Für jeden Level</h4>
                      <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                        Von Anfänger bis Profi - für jeden etwas dabei
                      </p>
                    </div>
                    <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--bb-cyan)' }}>Schneller Einstieg</h4>
                      <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                        Lerne die wichtigsten Features in wenigen Minuten
                      </p>
                    </div>
                    <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--bb-cyan)' }}>Tipps und Tricks</h4>
                      <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                        Profitiere von Expertenwissen und Best Practices
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-0 text-center text-sm" style={{ color: 'var(--bb-muted)' }}>
                  <Info size={16} className="inline-block mr-1" />
                  Wische nach links oder rechts um zu navigieren
                </div>
              </div>
            </CarouselItem>

            <CarouselItem>
              <div className="bb-card h-full flex flex-col justify-between min-h-[500px]">
                <div>
                  <div className="bb-form-title flex items-center gap-2 text-white text-lg">
                    <MonitorPlay size={24} />
                    Beliebte Tutorial-Themen
                  </div>
                </div>
                <div className="flex-grow mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>Fänge loggen</div>
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>KI-Buddy nutzen</div>
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>Spots verwalten</div>
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>Wetter-Alarme</div>
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>Trip-Planer</div>
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>Community Features</div>
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>Premium-Features</div>
                    <div className="text-sm rounded-lg p-3" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>Geräte verbinden</div>
                  </div>
                </div>
                <div className="pt-0 text-center text-sm" style={{ color: 'var(--bb-muted)' }}>
                  <Info size={16} className="inline-block mr-1" />
                  Wische nach links oder rechts um zu navigieren
                </div>
              </div>
            </CarouselItem>

          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </div>
  );
}
