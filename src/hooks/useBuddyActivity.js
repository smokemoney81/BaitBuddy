import { useSyncExternalStore } from 'react';
import { getBuddyActivity, subscribeBuddyActivity } from '@/lib/buddyActivity';

export function useBuddyActivity() {
  return useSyncExternalStore(subscribeBuddyActivity, getBuddyActivity);
}
