import React, { useEffect, useMemo, useRef, useState } from "react";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Package, Euro, Mail, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

const CATEGORIES = [
  "Rute",
  "Rolle",
  "Köder",
  "Schnur",
  "Set",
  "Bekleidung",
  "Zubehör",
  "Sonstiges",
];

const CONDITIONS = ["neu", "wie neu", "gut", "gebraucht", "defekt"];

function centsToDisplay(cents, currency) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(
    cents / 100
  );
}

import PremiumGuard from "@/components/premium/PremiumGuard";

export default function UsedGearMarket() {
  return (
    <PremiumGuard requiredPlan="basic" feature="Angelbedarf-Marktplatz">
      <UsedGearMarketInner />
    </PremiumGuard>
  );
}

export function UsedGearMarketInner() {
  useFeatureTracking("gear_market");
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Rute");
  const [condition, setCondition] = useState("gut");
  const [price, setPrice] = useState("0");
  const [negotiable, setNegotiable] = useState(false);
  const [location, setLocation] = useState("");
  const [shipping, setShipping] = useState(false);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Alle");
  const [conditionFilter, setConditionFilter] = useState("Alle");

  useEffect(() => {
    checkAuth();
    fetchListings();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await auth.me();
      setUser(currentUser);
    } catch (error) {
      console.log("User not logged in");
    }
  };

  const fetchListings = async () => {
    setLoading(true);
    try {
      const listings = await entities.GearListing.filter({ is_active: true });
      setItems(listings || []);
    } catch (error) {
      console.error(error);
      toast.error("Fehler beim Laden der Anzeigen");
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("Bitte einloggen!");
      return;
    }

    setUploading(true);

    try {
      const priceCents = Math.round(parseFloat(price) * 100);

      const imageUrls = [];
      if (images.length > 0) {
        const { UploadFile } = await import('@/integrations/Core');
        for (const file of images.slice(0, 6)) {
          const { file_url } = await UploadFile({ file });
          imageUrls.push(file_url);
        }
      }

      await entities.GearListing.create({
        title,
        category,
        condition,
        price_cents: priceCents,
        currency: "EUR",
        negotiable,
        location,
        shipping_available: shipping,
        description,
        image_urls: imageUrls,
        is_active: true,
        seller_email: user.email
      });

      toast.success("Anzeige erfolgreich erstellt!");
      setTitle("");
      setDescription("");
      setPrice("0");
      setImages([]);
      if (fileRef.current) fileRef.current.value = "";
      fetchListings();
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Hochladen");
    }
    setUploading(false);
  };

  const deactivate = async (id) => {
    try {
      await entities.GearListing.update(id, { is_active: false });
      setItems((prev) => prev.filter((x) => x.id !== id));
      toast.success("Anzeige gelöscht");
    } catch (error) {
      toast.error("Fehler beim Löschen");
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = categoryFilter === "Alle" || item.category === categoryFilter;
      const matchesCondition = conditionFilter === "Alle" || item.condition === conditionFilter;

      return matchesSearch && matchesCategory && matchesCondition;
    });
  }, [items, searchQuery, categoryFilter, conditionFilter]);

  return (
    <div className="bb-page" style={{ paddingBottom: '8rem' }}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <Package size={32} style={{ color: 'var(--bb-cyan)' }} />
          <h1 className="text-3xl font-bold" style={{ color: 'var(--bb-cyan)' }}>
            Gebrauchtmarkt
          </h1>
          <span className="px-3 py-1 text-xs font-bold rounded-full" style={{
            background: 'rgba(168,85,247,0.2)',
            color: '#c4b5fd',
            border: '1px solid rgba(168,85,247,0.4)',
            boxShadow: '0 0 10px rgba(168,85,247,0.3)',
          }}>
            BETA
          </span>
        </div>

        {!user && (
          <button
            onClick={() => auth.redirectToLogin()}
            className="bb-action"
          >
            Einloggen
          </button>
        )}
      </motion.div>

      {user && (
        <div className="bb-card mb-6" style={{ background: 'var(--bb-surface)' }}>
          <div className="bb-form-title flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
            <Upload size={20} />
            Neue Anzeige erstellen
          </div>
          <div>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <Input
                placeholder="Titel der Anzeige"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-gray-800 border-gray-700"
                required
              />

              <div className="grid grid-cols-3 gap-3">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-gray-800 border-gray-700">
                    <SelectValue placeholder="Kategorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger className="bg-gray-800 border-gray-700">
                    <SelectValue placeholder="Zustand" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Euro size={16} style={{ color: 'var(--bb-muted)' }} />
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Preis"
                    className="bg-gray-800 border-gray-700"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--bb-muted)' }}>
                  <input
                    type="checkbox"
                    checked={negotiable}
                    onChange={(e) => setNegotiable(e.target.checked)}
                    className="rounded"
                  />
                  Verhandlungsbasis
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--bb-muted)' }}>
                  <input
                    type="checkbox"
                    checked={shipping}
                    onChange={(e) => setShipping(e.target.checked)}
                    className="rounded"
                  />
                  Versand möglich
                </label>
              </div>

              <Input
                placeholder="Standort (optional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />

              <Textarea
                placeholder="Beschreibung"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-gray-800 border-gray-700 h-24"
              />

              <Input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setImages(Array.from(e.target.files || []))}
                className="bg-gray-800 border-gray-700"
              />
              <div className="text-xs" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>Maximal 6 Bilder</div>

              <button
                type="submit"
                className="bb-action"
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Wird hochgeladen...
                  </>
                ) : (
                  "Anzeige veröffentlichen"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="bb-card mb-6" style={{ background: 'var(--bb-surface)' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Suche nach Titel oder Beschreibung..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-gray-800 border-gray-700"
          />

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="bg-gray-800 border-gray-700">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Alle">Alle Kategorien</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={conditionFilter} onValueChange={setConditionFilter}>
            <SelectTrigger className="bg-gray-800 border-gray-700">
              <SelectValue placeholder="Zustand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Alle">Alle Zustände</SelectItem>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--bb-muted)' }}>Lade Anzeigen...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--bb-muted)' }}>
          Keine Anzeigen gefunden
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="bb-card overflow-hidden transition-all" style={{ background: 'var(--bb-surface)' }}>
                {item.image_urls && item.image_urls[0] ? (
                  <img
                    src={item.image_urls[0]}
                    alt={item.title}
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
                    <Package size={48} style={{ color: 'var(--bb-border)' }} />
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <h3 className="font-semibold text-lg" style={{ color: 'var(--bb-text)' }}>{item.title}</h3>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(6,182,212,0.2)', color: 'var(--bb-cyan)', border: '1px solid rgba(6,182,212,0.3)' }}>
                      {item.category}
                    </span>
                    <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                      {item.condition}
                    </span>
                  </div>

                  <div className="text-2xl font-bold" style={{ color: 'var(--bb-cyan)' }}>
                    {centsToDisplay(item.price_cents, "EUR")}
                    {item.negotiable && (
                      <span className="text-xs ml-2" style={{ color: 'var(--bb-muted)' }}>VB</span>
                    )}
                  </div>

                  {item.description && (
                    <p className="text-sm line-clamp-2" style={{ color: 'var(--bb-muted)' }}>
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>
                    {item.location && (
                      <div className="flex items-center gap-1">
                        <MapPin size={12} />
                        {item.location}
                      </div>
                    )}
                    {item.shipping_available && (
                      <span className="px-2 py-1 rounded" style={{ background: 'var(--bb-bg)', color: 'var(--bb-muted)' }}>
                        Versand
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid var(--bb-border)' }}>
                    <a
                      href={`mailto:${item.seller_email || item.created_by}?subject=${encodeURIComponent(
                        "Interesse an " + item.title
                      )}`}
                      className="text-sm flex items-center gap-1"
                      style={{ color: 'var(--bb-cyan)' }}
                    >
                      <Mail size={16} />
                      Kontakt
                    </a>

                    {user && user.email === item.created_by && (
                      <button
                        onClick={() => deactivate(item.id)}
                        className="p-2 rounded-lg"
                        style={{ color: '#f87171' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
