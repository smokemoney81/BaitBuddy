import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Share2, FileText, Image, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ExportPanel({ waterData }) {
  const [exporting, setExporting] = useState(false);

  const exportToCSV = () => {
    if (!waterData) {
      toast.error("Keine Daten zum Exportieren");
      return;
    }

    setExporting(true);

    try {
      // CSV Header
      let csv = "Parameter,Wert,Einheit,Qualität\n";

      // Parameter hinzufügen
      Object.entries(waterData.parameters).forEach(([_key, param]) => {
        csv += `${param.label},${param.value.toFixed(2)},${param.unit},${param.quality}\n`;
      });

      // Regelbasierte Einschaetzung (kein KI-Ergebnis) samt Herleitung
      csv += "\nBedingungen (regelbasiert)\n";
      csv += `Gesamtbewertung,${waterData.assessment.score ?? ''},/100,\n`;
      csv += `Quelle,${waterData.source},,\n`;
      csv += "\nHerleitung\nParameter,Wert,Einheit,Bewertung\n";
      waterData.assessment.reasons.forEach((reason) => {
        csv += `${reason.label},${reason.value.toFixed(2)},${reason.unit},${reason.score}\n`;
      });

      // Blob erstellen und Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `wasseranalyse_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("CSV erfolgreich exportiert!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Fehler beim Exportieren");
    }

    setExporting(false);
  };

  const exportToJSON = () => {
    if (!waterData) {
      toast.error("Keine Daten zum Exportieren");
      return;
    }

    setExporting(true);

    try {
      const json = JSON.stringify(waterData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `wasseranalyse_${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("JSON erfolgreich exportiert!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Fehler beim Exportieren");
    }

    setExporting(false);
  };

  const generateReport = () => {
    if (!waterData) {
      toast.error("Keine Daten zum Generieren");
      return;
    }

    setExporting(true);

    try {
      // Generiere einen HTML-Report
      let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gewässer-Analyse Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #22d3ee; border-bottom: 3px solid #22d3ee; padding-bottom: 10px; }
    h2 { color: #334155; margin-top: 30px; }
    .parameter { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; padding: 15px; background: #f8fafc; border-radius: 8px; margin: 10px 0; }
    .parameter strong { color: #0f172a; }
    .quality-good { color: #10b981; font-weight: bold; }
    .quality-medium { color: #f59e0b; font-weight: bold; }
    .quality-bad { color: #ef4444; font-weight: bold; }
    .score { font-size: 48px; font-weight: bold; color: #22d3ee; text-align: center; margin: 20px 0; }
    .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Gewässer-Analyse Report</h1>
    <p><strong>Standort:</strong> ${waterData.location.name}</p>
    <p><strong>Koordinaten:</strong> ${waterData.location.lat.toFixed(4)}°N, ${waterData.location.lon.toFixed(4)}°E</p>
    <p><strong>Zeitpunkt:</strong> ${new Date(waterData.timestamp).toLocaleString('de-DE')}</p>
    
    <h2>Wasser-Parameter</h2>
`;

      Object.entries(waterData.parameters).forEach(([_key, param]) => {
        const qualityClass = param.quality === 'gut' || param.quality === 'optimal' ? 'quality-good' : 
                            param.quality === 'mittel' ? 'quality-medium' : 'quality-bad';
        html += `
    <div class="parameter">
      <strong>${param.label}</strong>
      <span>${param.value.toFixed(2)} ${param.unit}</span>
      <span class="${qualityClass}">${param.quality}</span>
    </div>
`;
      });

      html += `
    <h2>Bedingungen (regelbasiert)</h2>
    <div class="score">${waterData.assessment.score ?? '—'}/100</div>
    <p>Gewichteter Mittelwert der oben gemessenen Parameter, keine KI-Bewertung.</p>
    ${waterData.assessment.reasons.map((reason) => `
    <div class="parameter">
      <strong>${reason.label}</strong>
      <span>${reason.value.toFixed(2)} ${reason.unit} (günstig ${reason.optimal})</span>
      <span>${reason.score}/100</span>
    </div>`).join('')}

    <div class="footer">
      <p>Generiert von BaitBuddy · Datenquelle: ${waterData.source}</p>
      <p>© ${new Date().getFullYear()} BaitBuddy - Alle Rechte vorbehalten</p>
    </div>
  </div>
</body>
</html>
`;

      const blob = new Blob([html], { type: 'text/html' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `wasseranalyse_report_${new Date().toISOString().split('T')[0]}.html`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Report erfolgreich generiert!");
    } catch (error) {
      console.error("Report generation error:", error);
      toast.error("Fehler beim Generieren des Reports");
    }

    setExporting(false);
  };

  const shareAnalysis = async () => {
    if (!waterData) {
      toast.error("Keine Daten zum Teilen");
      return;
    }

    const temp = waterData.parameters.water_temp || waterData.parameters.air_temp;
    const shareText = `Gewässer-Analyse\n\n${waterData.location.name}\nBedingungen: ${waterData.assessment.score ?? '—'}/100${
      temp ? `\n${temp.label}: ${temp.value.toFixed(1)} ${temp.unit}` : ''
    }\n\nErstellt mit BaitBuddy`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Gewässer-Analyse',
          text: shareText,
          url: window.location.href
        });
        toast.success("Erfolgreich geteilt!");
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Share error:", error);
        }
      }
    } else {
      // Fallback: In Zwischenablage kopieren
      try {
        await navigator.clipboard.writeText(shareText);
        toast.success("Link in Zwischenablage kopiert!");
      } catch {
        toast.error("Teilen nicht unterstützt");
      }
    }
  };

  return (
    <Card className="glass-morphism border-gray-800">
      <CardHeader>
        <CardTitle className="text-cyan-400">Export & Teilen</CardTitle>
        <p className="text-gray-400 text-sm">Analysedaten exportieren oder teilen</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          
          <Button
            onClick={exportToCSV}
            disabled={!waterData || exporting}
            variant="outline"
            className="border-gray-700 hover:bg-gray-800"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV Export
          </Button>

          <Button
            onClick={exportToJSON}
            disabled={!waterData || exporting}
            variant="outline"
            className="border-gray-700 hover:bg-gray-800"
          >
            <FileText className="w-4 h-4 mr-2" />
            JSON Export
          </Button>

          <Button
            onClick={generateReport}
            disabled={!waterData || exporting}
            variant="outline"
            className="border-gray-700 hover:bg-gray-800"
          >
            <Image className="w-4 h-4 mr-2" />
            HTML Report
          </Button>

          <Button
            onClick={shareAnalysis}
            disabled={!waterData || exporting}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Teilen
          </Button>

        </div>

        {waterData && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>Analysedaten bereit zum Export</span>
            </div>
          </div>
        )}

        {!waterData && (
          <div className="mt-4 text-center text-gray-500 text-sm">
            Führe zuerst eine Analyse durch
          </div>
        )}
      </CardContent>
    </Card>
  );
}