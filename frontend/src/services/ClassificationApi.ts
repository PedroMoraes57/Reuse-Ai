import { API_BASE_URL, buildAuthHeaders } from './api';
import type { AnalysisQuiz, GameUpdate } from './GamificationApi';

export interface TopPrediction {
  class_id: string;
  display_name_pt: string;
  confidence: number;
}
export interface BestMatch {
  class_id?: string;
  display_name_pt: string;
  description_pt: string;
  material?: string;
  hazardous?: boolean;
  reusable?: boolean;
  disposal_stream?: string;
  dropoff: string;
  recommendation: string;
  preparation?: string;
  region_notes?: string[];
  location?: Record<string, string | null> | null;
}

export interface ClassificationResult {
  best_match: BestMatch;
  confidence: number;
  effective_confidence_threshold?: number;
  top_predictions?: TopPrediction[];
  uncertain_prediction: boolean;
  uncertainty_reasons?: string[];
  classification_source?: 'model' | 'uncertain';
  analysis_id?: number;
  game_update?: GameUpdate;
  quiz?: AnalysisQuiz | null;
}

export interface ClassificationContext {
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  state?: string;
  stateCode?: string;
  city?: string;
}

interface ApiErrorPayload {
  detail?: string;
}

export interface NearbyDisposalPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  distance_km: number;
  address: string | null;
  category_label: string;
  acceptance_confidence: 'alta' | 'media' | 'baixa';
  acceptance_summary: string;
  match_reasons: string[];
  osm_url: string;
  directions_url: string;
  source: string;
  reference_url?: string | null;
  reference_label?: string | null;
}

export interface NearbyDisposalPointsResponse {
  stream: string;
  stream_label: string;
  radius_meters: number;
  points: NearbyDisposalPoint[];
  disclaimer: string;
  source: string;
  status: 'ok' | 'unavailable';
  warning: string | null;
  user_location: {
    latitude: number;
    longitude: number;
  };
  search_location?: {
    city?: string | null;
    state?: string | null;
    state_code?: string | null;
    country_code?: string | null;
  };
}

function appendOptionalField(
  form: FormData,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined) return;
  form.append(key, String(value));
}

async function getApiErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.detail) {
      return payload.detail;
    }
  }

  const errorText = await response.text();
  return errorText || `Erro ${response.status} ao analisar a imagem`;
}

export async function analyzeWaste(
  file: File,
  context?: ClassificationContext,
): Promise<ClassificationResult> {
  const form = new FormData();
  form.append('files', file);
  appendOptionalField(form, 'latitude', context?.latitude);
  appendOptionalField(form, 'longitude', context?.longitude);
  appendOptionalField(form, 'country_code', context?.countryCode);
  appendOptionalField(form, 'state', context?.state);
  appendOptionalField(form, 'state_code', context?.stateCode);
  appendOptionalField(form, 'city', context?.city);

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    body: form,
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return response.json() as Promise<ClassificationResult>;
}

export async function fetchNearbyDisposalPoints(input: {
  disposalStream: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  stateCode?: string;
  countryCode?: string;
}): Promise<NearbyDisposalPointsResponse> {
  const params = new URLSearchParams();
  params.set('disposal_stream', input.disposalStream);
  params.set('latitude', String(input.latitude));
  params.set('longitude', String(input.longitude));
  if (input.city) params.set('city', input.city);
  if (input.state) params.set('state', input.state);
  if (input.stateCode) params.set('state_code', input.stateCode);
  if (input.countryCode) params.set('country_code', input.countryCode);

  const response = await fetch(
    `${API_BASE_URL}/disposal-points/nearby?${params.toString()}`,
    {
      method: 'GET',
      headers: buildAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return response.json() as Promise<NearbyDisposalPointsResponse>;
}
