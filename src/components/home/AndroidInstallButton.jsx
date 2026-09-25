import React, { useEffect, useState } from 'react';
import { Smartphone, Download } from 'lucide-react';
import { fetchLatestApk, shouldOfferApk, isAndroidBrowser } from '@/lib/androidApk';

// „Android-App installieren“ auf der Login-Seite: lädt die aktuelle APK aus den
// GitHub-Releases. Die Installation selbst bestätigt Android — ein Browser darf
// keine App ohne Zustimmung installieren. Erscheint nur, wenn es wirklich eine
// APK gibt (siehe src/lib/androidApk.js).
export default function AndroidInstallButton() {
  const [apk, setApk] = useState(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!shouldOfferApk()) return undefined;
    const controller = new AbortController();
    fetchLatestApk({ signal: controller.signal })
      .then(setApk)
      .catch(() => setApk(null));
    return () => controller.abort();
  }, []);

  if (!apk) return null;
  const android = isAndroidBrowser();

  return (
    <div className="bb-landing-apk">
      <a
        href={apk.url}
        onClick={() => setStarted(true)}
        className="bb-landing-btn is-dark"
        rel="noopener"
        download
      >
        <Smartphone className="bb-landing-btn-icon text-cyan-300" aria-hidden="true" />
        <span>Android-App installieren</span>
        <Download className="bb-landing-btn-arrow" aria-hidden="true" />
      </a>
      <p className="bb-landing-apk-meta">
        {[
          apk.version && `Version ${apk.version}`,
          apk.sizeMb && `${apk.sizeMb.toLocaleString('de-DE')} MB`,
          !android && 'für Android-Handys',
        ].filter(Boolean).join(' · ')}
      </p>
      {started && (
        <p role="status" className="bb-landing-msg is-info">
          Download gestartet. Öffne danach die Datei „baitbuddy.apk“ und tippe auf „Installieren“. Fragt Android nach
          „Unbekannte Apps installieren“, erlaube es einmalig für deinen Browser.
        </p>
      )}
    </div>
  );
}
