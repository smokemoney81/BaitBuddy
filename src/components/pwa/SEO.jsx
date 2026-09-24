import { useEffect } from "react";

export default function SEO() {
  useEffect(() => {
    const setMeta = (attr, key, value) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };

    // Title und Description
    document.title = "BaitBuddy – Angeln smarter: Fangbuch, Spots, KI & mehr";
    setMeta("name", "description", "BaitBuddy: Fangbuch, Spots, Wetter, Analyse, Community und KI-Fangberatung – DSGVO-freundlich, Dark Mode, offline nutzbar.");
    setMeta("name", "theme-color", "#0b1324");
    setMeta("name", "robots", "index, follow");

    // Open Graph
    setMeta("property", "og:title", "BaitBuddy");
    setMeta("property", "og:description", "Fangbuch, Spots, Wetter, Analyse, Community und KI-Fangberatung – alles in einer App.");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", window.location.origin);
    setMeta("property", "og:image", "https://images.unsplash.com/photo-1502720705749-3cfa5f823cdf?q=80&w=1200&auto=format&fit=crop");

    // Icons und Manifest stehen korrekt in index.html (/icons/*, /manifest.json).
    // Früher wurden sie hier überschrieben: mit /favicon.ico und
    // /apple-touch-icon.png (existieren nicht → 404) und mit einem
    // Backend-Platzhalter als Manifest (kein gültiges Web-App-Manifest →
    // PWA nicht installierbar).
  }, []);

  return null;
}