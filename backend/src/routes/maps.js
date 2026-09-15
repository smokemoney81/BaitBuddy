import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'maps');
const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'map_downloader.py');

// Kartendownload/-verwaltung braucht ein beschreibbares Dateisystem und Python.
// In serverless-Umgebungen mit read-only FS (Vercel) ist das nicht moeglich.
// Auf einem Cloudflare-Container / Node-Host mit beschreibbarem Volume und dem
// im backend.Dockerfile installierten Python laeuft es hingegen. Per Env
// READ_ONLY_FS=1 laesst sich die Sperre auch dort erzwingen; Vercel bleibt aus
// Rueckwaertskompatibilitaet automatisch erkannt.
function isReadOnlyFs() {
  const flag = process.env.READ_ONLY_FS;
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return !!process.env.VERCEL;
}

// Deckt sich mit den IDs aus /maps/available und /maps/list — Whitelist gegen
// beliebige sourceId-Werte, die sonst 1:1 als argv an ein Python-Skript bzw.
// in einen Datei-Praefix-Loesch-Scan wandern wuerden.
const KNOWN_SOURCE_IDS = new Set([
  'gebco_europe_tile',
  'eu_dem_25m',
  'copernicus_dem_30',
  'osm_germany_pbf',
  'opentopomap',
  'wms_nrw_dtk',
]);

// ============================================================
// Utilities
// ============================================================

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

function runPythonScript(args) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [SCRIPT_PATH, ...args], {
      cwd: path.dirname(SCRIPT_PATH),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        reject(new Error(`Script failed with code ${code}: ${stderr}`));
      }
    });

    python.on('error', (error) => {
      reject(error);
    });
  });
}

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/maps/status
 * Returns status of all available map datasets
 */
router.get('/maps/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureDataDir();

    // List files in data directory
    const files = await fs.readdir(DATA_DIR);
    const maps = {};

    for (const file of files) {
      if (file.endsWith('_info.json')) {
        const sourceId = file.replace('_info.json', '');
        try {
          const content = await fs.readFile(
            path.join(DATA_DIR, file),
            'utf-8'
          );
          maps[sourceId] = JSON.parse(content);
        } catch (error) {
          console.warn(`Could not read ${file}:`, error);
        }
      }
    }

    // Get disk usage
    let totalSize = 0;
    for (const file of files) {
      if (!file.endsWith('_info.json') && !file.endsWith('.db')) {
        try {
          const stats = await fs.stat(path.join(DATA_DIR, file));
          totalSize += stats.size;
        } catch (error) {
          console.warn(`Could not stat file ${file}:`, error);
        }
      }
    }

    res.json({
      success: true,
      maps,
      totalSizeMb: (totalSize / (1024 * 1024)).toFixed(2),
      dataDir: DATA_DIR,
    });
  } catch (error) {
    console.error('Error getting map status:', error);
    res.status(500).json({ success: false, error: 'Interner Fehler' });
  }
});

/**
 * GET /api/maps/available
 * List all available map sources
 */
router.get('/maps/available', requireAuth, requireAdmin, (req, res) => {
  res.json({
    success: true,
    available: [
      {
        id: 'gebco_europe_tile',
        name: 'GEBCO 2026 Europa (Bathymetrie)',
        type: 'bathymetry',
        size: '~500 MB',
        priority: 1,
        autoDownload: true,
        desc: 'Bathymetrie für europäische Gewässer',
      },
      {
        id: 'eu_dem_25m',
        name: 'EU-DEM 25m (Höhenmodell)',
        type: 'dem',
        size: '~23 GB',
        priority: 2,
        autoDownload: false,
        desc: '25m Digitales Höhenmodell für Europa',
      },
      {
        id: 'copernicus_dem_30',
        name: 'Copernicus DEM 30m',
        type: 'dem',
        size: '~1 GB pro Tile',
        priority: 2,
        autoDownload: false,
        desc: 'Digitales Höhenmodell 30m Auflösung',
      },
      {
        id: 'osm_germany_pbf',
        name: 'OSM Deutschland (Vektor)',
        type: 'vector',
        size: '~4.5 GB',
        priority: 3,
        autoDownload: false,
        desc: 'Komplette OpenStreetMap Daten für Deutschland',
      },
      {
        id: 'opentopomap',
        name: 'OpenTopoMap (Tiles)',
        type: 'topographic',
        size: 'On-Demand',
        priority: 5,
        autoDownload: false,
        desc: 'Topografische Karte basierend auf OSM + SRTM',
      },
      {
        id: 'wms_nrw_dtk',
        name: 'WMS NRW Topografische Karten',
        type: 'wms',
        size: 'Service',
        priority: 6,
        autoDownload: false,
        desc: 'Web Map Service für NRW Topografische Karten',
      },
    ],
  });
});

/**
 * POST /api/maps/download
 * Trigger download of a specific map source
 */
router.post('/maps/download', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (isReadOnlyFs()) {
      return res.status(501).json({ success: false, error: 'Kartendownload ist in dieser Umgebung nicht verfuegbar (Dateisystem ist read-only)' });
    }

    const { sourceId } = req.body;

    if (!sourceId || !KNOWN_SOURCE_IDS.has(sourceId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Unbekannte oder fehlende sourceId' });
    }

    // Run download in background (don't wait)
    runPythonScript(['download', sourceId])
      .then(() => {
        console.log('✓ Map download completed:', sourceId);
      })
      .catch((error) => {
        console.error('✗ Map download failed:', error);
      });

    res.json({
      success: true,
      message: `Download started for ${sourceId}`,
      sourceId,
      note: 'Download runs in background. Check /api/maps/status for progress.',
    });
  } catch (error) {
    console.error('Error triggering download:', error);
    res.status(500).json({ success: false, error: 'Interner Fehler' });
  }
});

/**
 * POST /api/maps/download-auto
 * Trigger automatic downloads (priority 1 sources)
 */
router.post('/maps/download-auto', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (isReadOnlyFs()) {
      return res.status(501).json({ success: false, error: 'Kartendownload ist in dieser Umgebung nicht verfuegbar (Dateisystem ist read-only)' });
    }

    // Run auto-download in background
    runPythonScript(['auto'])
      .then(() => {
        console.log('✓ Auto-download completed');
      })
      .catch((error) => {
        console.error('✗ Auto-download failed:', error);
      });

    res.json({
      success: true,
      message: 'Automatic map downloads started (runs in background)',
      note: 'Check /api/maps/status for progress.',
    });
  } catch (error) {
    console.error('Error triggering auto-download:', error);
    res.status(500).json({ success: false, error: 'Interner Fehler' });
  }
});

/**
 * DELETE /api/maps/:sourceId
 * Delete a downloaded map dataset
 */
router.delete('/maps/:sourceId', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (isReadOnlyFs()) {
      return res.status(501).json({ success: false, error: 'Kartenverwaltung ist in dieser Umgebung nicht verfuegbar (Dateisystem ist read-only)' });
    }

    const { sourceId } = req.params;
    if (!KNOWN_SOURCE_IDS.has(sourceId)) {
      return res.status(400).json({ success: false, error: 'Unbekannte sourceId' });
    }
    await ensureDataDir();

    // Find and delete related files
    const files = await fs.readdir(DATA_DIR);
    let deleted = 0;

    for (const file of files) {
      if (file.startsWith(sourceId)) {
        const filePath = path.join(DATA_DIR, file);
        try {
          await fs.unlink(filePath);
          deleted++;
        } catch (error) {
          console.warn(`Could not delete ${file}:`, error);
        }
      }
    }

    res.json({
      success: true,
      message: `Deleted ${deleted} files for ${sourceId}`,
      deleted,
    });
  } catch (error) {
    console.error('Error deleting map:', error);
    res.status(500).json({ success: false, error: 'Interner Fehler' });
  }
});

/**
 * GET /api/maps/list
 * List all available sources with metadata
 */
router.get('/maps/list', requireAuth, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: 'Available map data sources (prioritized)',
    sources: [
      {
        id: 'gebco_europe_tile',
        name: 'GEBCO 2026 Europa',
        type: 'bathymetry',
        priority: 1,
        size: '~500 MB',
        auto: true,
      },
      {
        id: 'eu_dem_25m',
        name: 'EU-DEM 25m',
        type: 'dem',
        priority: 2,
        size: '~23 GB',
        auto: false,
      },
      {
        id: 'copernicus_dem_30',
        name: 'Copernicus DEM 30m',
        type: 'dem',
        priority: 2,
        size: '~1 GB per tile',
        auto: false,
      },
      {
        id: 'osm_germany_pbf',
        name: 'OSM Deutschland',
        type: 'vector',
        priority: 3,
        size: '~4.5 GB',
        auto: false,
      },
      {
        id: 'opentopomap',
        name: 'OpenTopoMap',
        type: 'topographic',
        priority: 5,
        size: 'On-Demand',
        auto: false,
      },
      {
        id: 'wms_nrw_dtk',
        name: 'WMS NRW DTK',
        type: 'wms',
        priority: 6,
        size: 'Service',
        auto: false,
      },
    ],
  });
});

export default router;
