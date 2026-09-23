// Offline Map Download Utility - speichert Kartenkacheln lokal

const TILE_DB_NAME = 'CatchGBT_MapTiles';
const TILE_DB_VERSION = 1;
const TILE_STORE_NAME = 'tiles';

let tilesDb = null;

export async function initTilesDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TILE_DB_NAME, TILE_DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      tilesDb = request.result;
      resolve(tilesDb);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(TILE_STORE_NAME)) {
        database.createObjectStore(TILE_STORE_NAME, { keyPath: 'url' });
      }
    };
  });
}

// Berechne Tile-Koordinaten aus Breite/Länge/Zoom
function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return { x, y, z: zoom };
}

// Berechne Tile-Range für Bounding Box
function calculateTileRange(bounds, zoom) {
  const { north, south, east, west } = bounds;
  const topLeft = latLonToTile(north, west, zoom);
  const bottomRight = latLonToTile(south, east, zoom);
  
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
    z: zoom
  };
}

// Lade eine einzelne Kartenkachel herunter
async function downloadTile(x, y, z, tileUrl) {
  try {
    const url = tileUrl
      .replace('{x}', x)
      .replace('{y}', y)
      .replace('{z}', z)
      .replace('{-y}', Math.pow(2, z) - y - 1);
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    return {
      url,
      tileKey: `${z}/${x}/${y}`,
      blob,
      timestamp: Date.now()
    };
  } catch (error) {
    console.warn(`Failed to download tile ${z}/${x}/${y}:`, error);
    return null;
  }
}

// Speichere Kartenkachel lokal
async function saveTile(tileData) {
  if (!tilesDb) await initTilesDB();
  
  return new Promise((resolve, reject) => {
    const transaction = tilesDb.transaction([TILE_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(TILE_STORE_NAME);
    const request = objectStore.put(tileData);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Lade Kartenkachel aus lokalem Speicher
export async function getCachedTile(x, y, z) {
  if (!tilesDb) await initTilesDB();
  
  const tileKey = `${z}/${x}/${y}`;
  
  return new Promise((resolve, reject) => {
    const transaction = tilesDb.transaction([TILE_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(TILE_STORE_NAME);
    const index = objectStore.index ? null : null;
    
    // Finde Tile nach Key-Pattern
    const getAllRequest = objectStore.getAll();
    getAllRequest.onsuccess = () => {
      const tile = getAllRequest.result.find(t => t.tileKey === tileKey);
      resolve(tile || null);
    };
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });
}

// Starte Download von Kartenkacheln
export async function downloadMapArea(bounds, zoomLevels, tileUrl, onProgress) {
  if (!tilesDb) await initTilesDB();
  
  let totalTiles = 0;
  let downloadedTiles = 0;
  let failedTiles = 0;

  // Berechne Gesamtanzahl Tiles
  const ranges = zoomLevels.map(z => calculateTileRange(bounds, z));
  totalTiles = ranges.reduce((sum, range) => {
    return sum + (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
  }, 0);

  onProgress({ status: 'starting', totalTiles, downloadedTiles, failedTiles });

  // Lade Tiles pro Zoom-Level herunter
  for (const range of ranges) {
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        try {
          const tileData = await downloadTile(x, y, range.z, tileUrl);
          
          if (tileData) {
            await saveTile(tileData);
            downloadedTiles++;
          } else {
            failedTiles++;
          }
        } catch {
          failedTiles++;
        }

        onProgress({ 
          status: 'downloading',
          totalTiles, 
          downloadedTiles, 
          failedTiles,
          current: `${range.z}/${x}/${y}`
        });
      }
    }
  }

  return {
    success: true,
    totalTiles,
    downloadedTiles,
    failedTiles,
    bounds,
    zoomLevels,
    timestamp: Date.now()
  };
}

// Berechne Speichergröße
export async function getOfflineMapSize() {
  if (!tilesDb) await initTilesDB();
  
  return new Promise((resolve, reject) => {
    const transaction = tilesDb.transaction([TILE_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(TILE_STORE_NAME);
    const getAllRequest = objectStore.getAll();
    
    getAllRequest.onsuccess = () => {
      let size = 0;
      getAllRequest.result.forEach(tile => {
        if (tile.blob) {
          size += tile.blob.size;
        }
      });
      resolve({
        tiles: getAllRequest.result.length,
        sizeInMB: (size / (1024 * 1024)).toFixed(2)
      });
    };
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });
}

// Lösche alle offline Kartendaten
export async function clearOfflineMaps() {
  if (!tilesDb) await initTilesDB();
  
  return new Promise((resolve, reject) => {
    const transaction = tilesDb.transaction([TILE_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(TILE_STORE_NAME);
    const request = objectStore.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}