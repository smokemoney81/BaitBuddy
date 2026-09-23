import React, { useState } from 'react';
import { Bell, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import NotificationService from '../../services/NotificationService';

function NotificationSettings({ isOpen, onClose }) {
  const [settings, setSettings] = useState(NotificationService.settings);
  const [permissionStatus, setPermissionStatus] = useState(Notification.permission);
  const [loading, setLoading] = useState(false);

  const commonSpecies = ['Hecht', 'Barsch', 'Forelle', 'Schleie', 'Aal', 'Karpfen'];

  // Frage um Permission
  const handleRequestPermission = async () => {
    setLoading(true);
    try {
      const granted = await NotificationService.requestPermission();
      setPermissionStatus(Notification.permission);
      if (granted) {
        toast.success('Benachrichtigungen aktiviert!');
      } else {
        toast.error('Benachrichtigungen wurden abgelehnt');
      }
    } catch {
      toast.error('Fehler beim Aktivieren von Benachrichtigungen');
    } finally {
      setLoading(false);
    }
  };

  // Speichere Einstellungen
  const handleSave = () => {
    NotificationService.saveSettings(settings);
    toast.success('Einstellungen gespeichert');
  };

  // Sende Test-Notification
  const handleTestNotification = async () => {
    try {
      await NotificationService.sendTestNotification();
      toast.success('Test-Notification gesendet');
    } catch {
      toast.error('Fehler beim Senden der Test-Notification');
    }
  };

  // Starte Monitoring
  const handleStartMonitoring = () => {
    if (permissionStatus !== 'granted') {
      toast.error('Benachrichtigungen müssen zuerst aktiviert werden');
      return;
    }
    toast.success('Überwachung gestartet - du erhältst Benachrichtigungen!');
  };

  const toggleSpecies = (species) => {
    setSettings(prev => ({
      ...prev,
      notifySpecies: prev.notifySpecies.includes(species)
        ? prev.notifySpecies.filter(s => s !== species)
        : [...prev.notifySpecies, species],
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-cyan-700 rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-cyan-300 flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Benachrichtigungen
          </h2>
          <button type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Permission Status */}
        {permissionStatus !== 'granted' && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-yellow-300">
                <div className="font-semibold mb-2">Benachrichtigungen nicht aktiviert</div>
                <button type="button"
                  onClick={handleRequestPermission}
                  disabled={loading}
                  className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-semibold py-2 rounded transition disabled:opacity-50"
                >
                  {loading ? 'Wird aktiviert...' : 'Aktivieren'}
                </button>
              </div>
            </div>
          </div>
        )}

        {permissionStatus === 'granted' && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-green-400" />
            <div className="text-xs text-green-300">Benachrichtigungen aktiviert</div>
          </div>
        )}

        {/* Solunar Threshold */}
        <div>
          <label className="text-sm font-semibold text-gray-300 block mb-2">
            Solunar-Schwelle: {settings.solunarThreshold}%
          </label>
          <input
            type="range"
            min="50"
            max="100"
            value={settings.solunarThreshold}
            onChange={(e) => setSettings({ ...settings, solunarThreshold: parseInt(e.target.value) })}
            className="w-full"
          />
          <div className="text-xs text-gray-400 mt-1">
            Benachrichtige nur bei Solunar-Quality über {settings.solunarThreshold}%
          </div>
        </div>

        {/* Prediction Threshold */}
        <div>
          <label className="text-sm font-semibold text-gray-300 block mb-2">
            KI-Vorhersage-Schwelle: {settings.predictionThreshold}%
          </label>
          <input
            type="range"
            min="50"
            max="100"
            value={settings.predictionThreshold}
            onChange={(e) => setSettings({ ...settings, predictionThreshold: parseInt(e.target.value) })}
            className="w-full"
          />
          <div className="text-xs text-gray-400 mt-1">
            Benachrichtige nur bei Fangvorhersage über {settings.predictionThreshold}%
          </div>
        </div>

        {/* Zeitfenster */}
        <div>
          <label className="text-sm font-semibold text-gray-300 block mb-2">
            Zeitfenster für Benachrichtigungen
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="0"
              max="23"
              value={settings.timeWindow.start}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  timeWindow: { ...settings.timeWindow, start: parseInt(e.target.value) },
                })
              }
              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
            />
            <span className="text-gray-400">bis</span>
            <input
              type="number"
              min="0"
              max="23"
              value={settings.timeWindow.end}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  timeWindow: { ...settings.timeWindow, end: parseInt(e.target.value) },
                })
              }
              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
            />
            <span className="text-xs text-gray-400">Uhr</span>
          </div>
        </div>

        {/* Spezies Selection */}
        <div>
          <label className="text-sm font-semibold text-gray-300 block mb-2">
            Für welche Arten benachrichtigen?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {commonSpecies.map((species) => (
              <button type="button"
                key={species}
                onClick={() => toggleSpecies(species)}
                className={`px-3 py-2 rounded text-xs font-semibold transition border ${
                  settings.notifySpecies.includes(species)
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                {species}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2 border-t border-gray-700 pt-3">
          <button type="button"
            onClick={handleTestNotification}
            disabled={permissionStatus !== 'granted'}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white font-semibold py-2 rounded transition text-sm"
          >
            Test-Benachrichtigung
          </button>

          <button type="button"
            onClick={handleSave}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded transition text-sm flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Einstellungen speichern
          </button>

          <button type="button"
            onClick={onClose}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2 rounded transition text-sm"
          >
            Schließen
          </button>
        </div>

        {/* Info */}
        <div className="bg-gray-800/50 rounded-lg p-2 text-xs text-gray-400 italic">
          Benachrichtigungen funktionieren nur wenn der Browser offen ist. Für mobile App-Notifications werden Push-Services benötigt.
        </div>
      </div>
    </div>
  );
}

export default NotificationSettings;
