// Freigestellte Fischbilder aus public/fish (Lizenzen: public/fish/CREDITS.md).
const FISH_IMAGES = [
  { match: ['karpfen', 'carp'], image: '/fish/carp.webp' },
  { match: ['barsch', 'perch'], image: '/fish/perch.webp' },
  { match: ['forelle', 'trout', 'saibling'], image: '/fish/trout.webp' },
  { match: ['hecht', 'pike'], image: '/fish/pike.webp' },
  { match: ['zander', 'walleye'], image: '/fish/zander.webp' },
  { match: ['wels', 'waller', 'catfish'], image: '/fish/catfish.webp' },
];

// Bild zur ersten erkennbaren Fischart in einem Freitext ("Zander, Hecht").
export function fishImageFor(species) {
  const text = String(species || '').toLowerCase();
  if (!text) return null;
  const hit = FISH_IMAGES.find(entry => entry.match.some(name => text.includes(name)));
  return hit ? hit.image : null;
}
