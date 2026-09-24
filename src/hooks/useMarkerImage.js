import { useState, useEffect, useCallback } from 'react';

const CACHE_KEY_PREFIX = 'marker_image_cache_';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCacheKey(query) {
  return `${CACHE_KEY_PREFIX}${query}`;
}

function getCachedImage(query) {
  try {
    const cached = localStorage.getItem(getCacheKey(query));
    if (cached) {
      const { url, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        return url;
      } else {
        localStorage.removeItem(getCacheKey(query));
      }
    }
  } catch (error) {
    console.warn('Cache retrieval error:', error);
  }
  return null;
}

function setCachedImage(query, url) {
  try {
    localStorage.setItem(
      getCacheKey(query),
      JSON.stringify({
        url,
        timestamp: Date.now()
      })
    );
  } catch (error) {
    console.warn('Cache storage error:', error);
  }
}

export function useMarkerImage(imageSource, markerType) {
  const [imageUrl, setImageUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchImage = useCallback(async () => {
    if (!imageSource) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Check cache first
    const cached = getCachedImage(imageSource);
    if (cached) {
      setImageUrl(cached);
      setIsLoading(false);
      return;
    }

    try {
      // If already a URL, use it directly
      if (typeof imageSource === 'string' && (imageSource.startsWith('http') || imageSource.startsWith('data'))) {
        setImageUrl(imageSource);
        setCachedImage(imageSource, imageSource);
        setIsLoading(false);
        return;
      }

      // If it's a query string, fetch from Wikimedia
      if (typeof imageSource === 'string') {
        const url = await fetchWikimediaImage(imageSource, markerType);
        if (url) {
          setImageUrl(url);
          setCachedImage(imageSource, url);
        } else {
          setError('No image found');
        }
      }
    } catch (err) {
      console.error('Image fetch error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [imageSource, markerType]);

  useEffect(() => {
    fetchImage();
  }, [fetchImage]);

  return { imageUrl, isLoading, error };
}

async function fetchWikimediaImage(query, markerType) {
  try {
    const searchQuery = `${query} ${markerType === 'fluss' ? 'river' : markerType === 'forellensee' ? 'lake' : 'landscape'}`;

    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?` +
      `action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srnamespace=6&srlimit=5&format=json&origin=*`,
      {
        timeout: 5000
      }
    );

    if (!response.ok) throw new Error('Wikimedia API error');

    const data = await response.json();
    if (!data.query?.search || data.query.search.length === 0) {
      return null;
    }

    // Get the first result's title
    const title = data.query.search[0].title;

    // Fetch file info
    const fileResponse = await fetch(
      `https://commons.wikimedia.org/w/api.php?` +
      `action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json&origin=*`,
      {
        timeout: 5000
      }
    );

    if (!fileResponse.ok) throw new Error('File info fetch error');

    const fileData = await fileResponse.json();
    const pages = fileData.query.pages;
    const page = Object.values(pages)[0];

    if (page.imageinfo?.[0]?.url) {
      return page.imageinfo[0].url;
    }

    return null;
  } catch (error) {
    console.warn('Wikimedia fetch error:', error);
    return null;
  }
}

export function generateOSMMapImage(lat, lng, zoom = 12, _width = 800, _height = 400) {
  // Using OSM tile server
  if (!lat || !lng) return null;

  // Calculate tile coordinates
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(((lat * Math.PI) / 180)) + 1 / Math.cos(((lat * Math.PI) / 180))) / Math.PI) /
      2) *
    n
  );

  // Return OSM tile URL (static map using tiles)
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

export default useMarkerImage;
