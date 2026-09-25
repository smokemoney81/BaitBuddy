import { useLayoutEffect } from 'react';

// Hält eine Seite exakt auf der sichtbaren Höhe zwischen ihrer Oberkante und
// dem Fensterende und sperrt solange das Dokument-Scrollen (Klasse
// `bb-no-page-scroll` auf <html>). Die Höhe landet als px-Wert in der
// CSS-Variable `--bb-fit-height` am Element; den Abstand zur fixen Bottom-Nav
// regelt das CSS der Seite.
//
// Bewusst per JS statt `100dvh`: dvh fehlt im ältesten unterstützten WebView
// (Chrome 90) und auf iOS 14. `innerHeight` schrumpft dagegen überall mit, wenn
// sich die Tastatur öffnet (Android: adjustResize).
//
// Die Oberkante wird über die offsetTop-Kette gemessen, nicht über
// getBoundingClientRect — die Seitenübergänge verschieben die Seite per
// transform, das würde die Messung während der Animation verfälschen.
export function useFitToViewport(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const root = document.documentElement;
    root.classList.add('bb-no-page-scroll');
    if (window.scrollY > 0) window.scrollTo(0, 0);

    let frame = 0;
    const measure = () => {
      frame = 0;
      let top = 0;
      for (let node = el; node; node = node.offsetParent) top += node.offsetTop;
      el.style.setProperty('--bb-fit-height', `${Math.max(0, window.innerHeight - top)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    // Banner oberhalb (Trial, Demo) und die ausblendende Vorgängerseite beim
    // Seitenwechsel verschieben die Oberkante, ohne dass sich das Fenster
    // ändert. Sie ändern aber die Größe eines Vorfahren — die beobachten wir.
    let observer = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(schedule);
      for (let node = el.parentElement; node; node = node.parentElement) observer.observe(node);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      observer?.disconnect();
      root.classList.remove('bb-no-page-scroll');
    };
  }, [ref]);
}
