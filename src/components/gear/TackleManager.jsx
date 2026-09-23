import React, { useEffect, useState } from 'react';
import { entities } from '@/api/frontendClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Edit2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { notifyAction, actionMessages } from '@/lib/actionNotifications';
import { motion } from 'framer-motion';

const TACKLE_CATEGORIES = [
  { value: 'köder', label: 'Köder & Lures' },
  { value: 'vorfach', label: 'Vorfach & Leader' },
  { value: 'zubehör', label: 'Zubehör' },
  { value: 'kleinkram', label: 'Kleinkram & Sonstiges' },
];

const TACKLE_CONDITIONS = ['neu', 'wie neu', 'gut', 'gebraucht', 'beschädigt'];

export function TackleManager({ userId: _userId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: 'köder',
    quantity: 1,
    condition: 'gut',
    notes: '',
    size: '',
  });

  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const result = await entities.GearItem.filter({
        item_type: 'tackle',
      });
      setItems(result || []);
    } catch (error) {
      console.error('Fehler beim Laden von Tackle-Items:', error);
      toast.error('Tackle-Items konnten nicht geladen werden');
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        ...formData,
        item_type: 'tackle',
      };

      if (editingId) {
        await entities.GearItem.update(editingId, payload);
        toast.success('Tackle-Item aktualisiert');
      } else {
        await entities.GearItem.create(payload);
        toast.success('Tackle-Item erstellt');
        const msg = actionMessages.gearAdded(payload.name);
        notifyAction(msg.title, msg);
      }

      setFormData({
        name: '',
        category: 'köder',
        quantity: 1,
        condition: 'gut',
        notes: '',
        size: '',
      });
      setEditingId(null);
      fetchItems();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      toast.error('Fehler beim Speichern des Tackle-Items');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setFormData({
      name: item.name || '',
      category: item.category || 'köder',
      quantity: item.quantity || 1,
      condition: item.condition || 'gut',
      notes: item.notes || '',
      size: item.size || '',
    });
    setExpanded(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Wirklich löschen?')) return;

    try {
      await entities.GearItem.delete(id);
      setItems(items.filter(item => item.id !== id));
      toast.success('Tackle-Item gelöscht');
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      toast.error('Fehler beim Löschen des Items');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({
      name: '',
      category: 'köder',
      quantity: 1,
      condition: 'gut',
      notes: '',
      size: '',
    });
    setExpanded(false);
  };

  const groupedItems = items.reduce((acc, item) => {
    const cat = item.category || 'köder';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-emerald-400 flex items-center gap-2">
            <span>Tackle Management</span>
          </CardTitle>
          <button type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 border-t border-gray-800 pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                placeholder="Name (z.B. Shimano Wobbler)"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-gray-800 border-gray-700"
                required
              />

              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  {TACKLE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                placeholder="Menge"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                className="bg-gray-800 border-gray-700"
                min="1"
                required
              />

              <Select value={formData.condition} onValueChange={(v) => setFormData({ ...formData, condition: v })}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Zustand" />
                </SelectTrigger>
                <SelectContent>
                  {TACKLE_CONDITIONS.map(cond => (
                    <SelectItem key={cond} value={cond}>{cond}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Größe (z.B. 8cm, 0.5oz)"
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                className="bg-gray-800 border-gray-700"
              />

              <Input
                placeholder="Notizen (optional)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 flex-1"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Wird gespeichert...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    {editingId ? 'Aktualisieren' : 'Hinzufügen'}
                  </>
                )}
              </Button>

              {editingId && (
                <Button
                  type="button"
                  onClick={handleCancel}
                  variant="outline"
                  className="flex-1"
                >
                  Abbrechen
                </Button>
              )}
            </div>
          </form>

          <div className="border-t border-gray-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">
              Meine Tackle-Items ({items.length})
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Keine Tackle-Items vorhanden</p>
            ) : (
              <div className="space-y-3">
                {TACKLE_CATEGORIES.map(category => {
                  const categoryItems = groupedItems[category.value] || [];
                  if (categoryItems.length === 0) return null;

                  return (
                    <div key={category.value}>
                      <h4 className="text-xs font-semibold text-cyan-400 mb-2">{category.label}</h4>
                      <div className="space-y-2">
                        {categoryItems.map(item => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between border border-gray-700"
                          >
                            <div className="flex-1">
                              <div className="font-medium text-white text-sm">{item.name}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">
                                  Menge: {item.quantity}
                                </span>
                                {item.size && (
                                  <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">
                                    {item.size}
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-1 rounded ${
                                  item.condition === 'neu' || item.condition === 'wie neu'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : item.condition === 'gut'
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : 'bg-yellow-500/20 text-yellow-300'
                                }`}>
                                  {item.condition}
                                </span>
                              </div>
                              {item.notes && (
                                <p className="text-xs text-gray-400 mt-1">{item.notes}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button type="button"
                                onClick={() => handleEdit(item)}
                                className="p-2 hover:bg-gray-700 rounded transition-colors"
                                title="Bearbeiten"
                              >
                                <Edit2 className="w-4 h-4 text-blue-400" />
                              </button>
                              <button type="button"
                                onClick={() => handleDelete(item.id)}
                                className="p-2 hover:bg-gray-700 rounded transition-colors"
                                title="Löschen"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}