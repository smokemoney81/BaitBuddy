import { api } from '@/api/frontendClient.js';
export const getFishingRecommendation = (data) =>
  api.post('/api/ai/fishing-recommendation', data);
export default getFishingRecommendation;
