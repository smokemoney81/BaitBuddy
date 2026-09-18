import { toast } from 'sonner';
import { auth } from '@/api/auth';
import { entities } from '@/api/frontendClient';
import { Catch } from '@/entities/Catch';
import { Spot } from '@/entities/Spot';
import { resolvePage } from '@/lib/voicePages';
import { createPageUrl } from '@/utils';

const ACTION_RETRY_ATTEMPTS = 2;
const ACTION_RETRY_DELAY = 1000;

async function executeWithRetry(fn, maxAttempts = ACTION_RETRY_ATTEMPTS) {
  let lastError;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, ACTION_RETRY_DELAY));
      }
    }
  }
  throw lastError;
}

export async function executeBuddyAction(action, context, options = {}) {
  if (!action || !action.type) {
    return { success: false, message: null };
  }

  const { navigate } = context;
  const userLocation = context.userLocation || null;
  const { retryAttempts = ACTION_RETRY_ATTEMPTS } = options;

  try {
    if (action.type === 'navigate') {
      const target = resolvePage(action.params?.page);
      if (!target) {
        return { success: false, message: null };
      }
      navigate(createPageUrl(target));
      return { success: true, message: null };
    }

    if (action.type === 'log_catch') {
      const p = action.params || {};
      if (!p.species) {
        return {
          success: false,
          message: 'Bitte sage mir welche Fischart - dann trage ich es ein.',
        };
      }

      await executeWithRetry(async () => {
        await Catch.create({
          species: p.species,
          catch_time: new Date().toISOString(),
          ...(p.length_cm != null && { length_cm: Number(p.length_cm) }),
          ...(p.weight_kg != null && { weight_kg: Number(p.weight_kg) }),
          ...(p.bait_used && { bait_used: p.bait_used }),
          ...(p.notes && { notes: p.notes }),
          ...(p.is_released != null && { is_released: !!p.is_released }),
        });
      }, retryAttempts);

      toast.success(`Fang eingetragen: ${p.species}`);
      return { success: true, message: `Fang ${p.species} wurde im Fangbuch eingetragen.` };
    }

    if (action.type === 'add_spot' || action.type === 'save_spot') {
      const p = action.params || {};
      if (!p.name) {
        return {
          success: false,
          message: 'Ich brauche Name und Koordinaten fuer den Spot.',
        };
      }

      const lat = p.latitude != null ? Number(p.latitude) : userLocation?.latitude;
      const lng = p.longitude != null ? Number(p.longitude) : userLocation?.longitude;

      if (lat == null || lng == null) {
        return {
          success: false,
          message: 'Ich brauche Name und Koordinaten fuer den Spot.',
        };
      }

      await executeWithRetry(async () => {
        await Spot.create({
          name: p.name,
          latitude: lat,
          longitude: lng,
          water_type: p.water_type || 'see',
          notes: p.notes || '',
          ...(p.is_favorite != null && { is_favorite: !!p.is_favorite }),
        });
      }, retryAttempts);

      toast.success(`Spot gespeichert: ${p.name}`);
      return { success: true, message: `Spot ${p.name} gespeichert.` };
    }

    if (action.type === 'post_community') {
      const p = action.params || {};
      if (!p.text) {
        return { success: false, message: 'Was soll ich posten?' };
      }
      const me = await auth.me().catch(() => null);
      await entities.Post.create({
        text: p.text,
        author_name: me?.nickname || me?.full_name || 'Angler',
      });
      toast.success('Community-Post erstellt');
      return { success: true, message: 'Dein Beitrag wurde in der Community gepostet.' };
    }

    if (action.type === 'create_trip') {
      const p = action.params || {};
      if (!p.title || !p.target_fish) {
        return { success: false, message: 'Ich brauche Titel und Zielfisch fuer den Trip.' };
      }
      await entities.FishingPlan.create({
        title: p.title,
        target_fish: p.target_fish,
        spot_info: p.spot_info || '',
        weather_summary: p.weather_summary || '',
        gear_summary: p.gear_summary || '',
        steps: Array.isArray(p.steps) ? p.steps : [],
        is_active: !!p.is_active,
      });
      toast.success(`Trip angelegt: ${p.title}`);
      return { success: true, message: `Trip ${p.title} wurde im Tripplaner angelegt.` };
    }

    if (action.type === 'support_ticket') {
      const p = action.params || {};
      if (!p.subject || !p.message) {
        return { success: false, message: 'Ich brauche Betreff und Beschreibung.' };
      }
      const me = await auth.me().catch(() => null);
      await entities.SupportTicket.create({
        subject: p.subject,
        message: p.message,
        category: p.category || 'frage',
        user_email: me?.email,
        user_name: me?.full_name,
      });
      toast.success('Support-Ticket erstellt');
      return { success: true, message: 'Dein Support-Ticket wurde erstellt.' };
    }

    if (action.type === 'open_url') {
      const p = action.params || {};
      if (!p.url) return { success: false, message: null };
      // Die URL stammt aus einer KI-generierten Aktion und ist damit potenziell
      // per Prompt-Injection beeinflussbar. Nur http/https zulassen (kein
      // javascript:/data:) und mit noopener,noreferrer öffnen (Reverse-Tabnabbing).
      let safeUrl;
      try {
        safeUrl = new URL(p.url, window.location.origin);
      } catch {
        return { success: false, message: null };
      }
      if (safeUrl.protocol !== 'http:' && safeUrl.protocol !== 'https:') {
        return { success: false, message: null };
      }
      window.open(safeUrl.href, '_blank', 'noopener,noreferrer');
      return { success: true, message: null };
    }

    if (action.type === 'generate_video') {
      const p = action.params || {};
      if (!p.prompt || p.prompt.trim().length === 0) {
        return { success: false, message: 'Ich brauche einen Text fuer das Video.' };
      }
      // Video-Generator wird clientseitig im AIBuddyWidget angezeigt
      // Dispatch an context/store erfolgt durch den Widget-Container
      toast.success('Starte Video-Generierung...');
      return {
        success: true,
        message: 'Dein Video wird generiert. Das kann eine Minute dauern.',
        video_prompt: p.prompt,
        video_duration: p.duration || 8,
      };
    }

    return { success: false, message: null };
  } catch (error) {
    console.error('Buddy action failed:', error?.message);
    toast.error('Aktion fehlgeschlagen');
    return {
      success: false,
      message: 'Die Aktion konnte nicht ausgefuehrt werden.',
    };
  }
}
