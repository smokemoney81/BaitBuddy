// Lokale FAQ-Datenbank des KI-Buddys — Frontend-Einstieg.
//
// Daten und Such-Engine liegen einmalig unter backend/src/lib/, weil das
// Backend dieselben Einträge in den LLM-Prompt einbettet (das Backend-Image
// kopiert nur backend/, der Vite-Build sieht das ganze Repo). Die Module sind
// reines JavaScript ohne Node-Abhängigkeiten und laufen im Browser ohne API.
export {
  FAQ_ENTRIES,
  FAQ_CATEGORIES,
  findFaqMatch,
  resolveLocalAnswer,
  getOfflineFallback,
  pickFaqAnswer,
  normalizeText,
  isActionRequest,
  needsPersonalContext,
  isFollowUpQuestion,
} from '../../backend/src/lib/buddyFaq.js';

import { PAGE_META } from '@/lib/pageMeta';

// Seiten, die PAGE_META (noch) nicht als eigenen Titel führt.
const EXTRA_PAGE_LABELS = {
  ARKnotenAssistent: 'Knoten-Assistent',
  GearMaintenance: 'Wartungsprotokoll',
  Devices: 'Geräte',
};

/** Anzeigename einer App-Seite für den "… öffnen"-Link unter FAQ-Antworten. */
export function faqPageLabel(page) {
  return PAGE_META[page]?.title || EXTRA_PAGE_LABELS[page] || page;
}
