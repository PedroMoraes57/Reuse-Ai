function resolveApiBaseUrl() {
  const explicitApiUrl = import.meta.env.VITE_API_URL;
  if (explicitApiUrl) {
    return explicitApiUrl;
  }

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    return `${backendUrl.replace(/\/$/, '')}/api`;
  }

  return '/api';
}

const API_BASE_URL = resolveApiBaseUrl();

export interface TopPrediction {
  class_id: string;
  display_name_pt: string;
  confidence: number;
}
export interface BestMatch {
  display_name_pt: string;
  description_pt: string;
  dropoff: string;
  recommendation: string;
}

export interface ClassificationResult {
  best_match: BestMatch;
  confidence: number;
  top_predictions?: TopPrediction[];
  uncertain_prediction: boolean;
  uncertainty_reasons?: string[];
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
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return response.json() as Promise<ClassificationResult>;
}
