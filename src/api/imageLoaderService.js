const CACHE_PREFIX = 'marker_image_';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const API_TIMEOUT = 5000;

function getCacheKey(type, id) {
  return `${CACHE_PREFIX}${type}_${id}`;
}

function getCached(type, id) {
  try {
    const key = getCacheKey(type, id);
    const cached = localStorage.getItem(key);
    if (cached) {
      const { url, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        return url;
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('Cache error:', error);
  }
  return null;
}

function setCached(type, id, url) {
  try {
    const key = getCacheKey(type, id);
    localStorage.setItem(key, JSON.stringify({ url, timestamp: Date.now() }));
  } catch (error) {
    console.warn('Cache write error:', error);
  }
}

async function fetchWithTimeout(url, timeout = API_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function fetchWikimediaImage(query, markerType = 'landscape') {
  try {
    const searchQuery = `${query} ${
      markerType === 'fluss'
        ? 'river'
        : markerType === 'forellensee'
        ? 'lake'
        : markerType === 'tiefenkarte'
        ? 'water depth map'
        : 'landscape'
    }`;

    const response = await fetchWithTimeout(
      `https://commons.wikimedia.org/w/api.php?` +
        `action=query&list=search&srsearch=${encodeURIComponent(
          searchQuery
        )}&srnamespace=6&srlimit=10&format=json&origin=*`
    );

    if (!response.ok) throw new Error('API error');

    const data = await response.json();
    if (!data.query?.search || data.query.search.length === 0) {
      return null;
    }

    // Try to get image URL from search results
    const title = data.query.search[0].title;
    const fileResponse = await fetchWithTimeout(
      `https://commons.wikimedia.org/w/api.php?` +
        `action=query&titles=${encodeURIComponent(
          title
        )}&prop=imageinfo&iiprop=url&format=json&origin=*`
    );

    if (!fileResponse.ok) throw new Error('File info error');

    const fileData = await fileResponse.json();
    const pages = fileData.query.pages;
    const page = Object.values(pages)[0];

    if (page.imageinfo?.[0]?.url) {
      // Return resized image URL
      return page.imageinfo[0].url.replace(/\/\d+px-/, '/400px-');
    }

    return null;
  } catch (error) {
    console.warn('Wikimedia error:', error);
    return null;
  }
}

export function generateOSMStaticMap(lat, lng, zoom = 13, _width = 400, _height = 250) {
  if (!lat || !lng) return null;

  // Using OSM Static Map service or fallback to tile
  try {
    // Option 1: Stamen Terrain (prettier maps)
    return `https://tiles.stadiamaps.com/tiles/stamen_terrain/${zoom}/${Math.floor(
      ((lng + 180) / 360) * Math.pow(2, zoom)
    )}/${Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
        Math.pow(2, zoom)
    )}.png`;
  } catch (error) {
    console.warn('OSM map generation error:', error);
    return null;
  }
}

export async function getMarkerImage(type, id, query, markerType = 'landscape') {
  // Check cache first
  const cached = getCached(type, id);
  if (cached) return cached;

  // Try Wikimedia first
  let imageUrl = await fetchWikimediaImage(query, markerType);

  if (imageUrl) {
    setCached(type, id, imageUrl);
    return imageUrl;
  }

  return null;
}

export function getMarkerImageFallbacks(lat, lng) {
  return [generateOSMStaticMap(lat, lng, 13)].filter(Boolean);
}

export const typeIcons = {
  spot: '📍',
  club: '🏛️',
  fluss: '🏞️',
  tiefenkarte: '🗻',
  forellensee: '🎣',
  bathymetrie: '🌊',
  park: '🌳'
};

export default {
  fetchWikimediaImage,
  generateOSMStaticMap,
  getMarkerImage,
  getMarkerImageFallbacks,
  typeIcons
};
