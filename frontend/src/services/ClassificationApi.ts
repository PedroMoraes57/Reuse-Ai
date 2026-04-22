// ⚠️ CONEXÃO COM O BACKEND DJANGO + IA
// URL base da API — ajuste conforme o ambiente (dev/prod)
// Em dev local: http://localhost:8000
// Em produção: troque pela URL do seu servidor Django
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface TopPrediction {
  class_id: string;
  display_name_pt: string;
  confidence: number;
}

export interface BestMatch {
  class_id: string;
  display_name_pt: string;
  description_pt: string;
  dropoff: string;
  recommendation: string;
  preparation: string;
  material: string;
  hazardous: boolean;
  reusable: boolean;
  region_notes: string[];
  location: {
    country_code?: string | null;
    state?: string | null;
    state_code?: string | null;
    city?: string | null;
  } | null;
}

export interface ClassificationResult {
  images_analyzed?: number;
  device?: string;
  best_match: BestMatch;
  top_predictions: TopPrediction[];
  uncertain_prediction: boolean;
}

/**
 * Envia a imagem para o endpoint /analyze do Django.
 * O backend processa com a IA e retorna a classificação do resíduo.
 *
 * ⚠️ Se você mudar a rota no Django, atualize aqui também.
 */
export async function analyzeWaste(file: File): Promise<ClassificationResult> {
  const form = new FormData();
  form.append('files', file); // ⚠️ campo "files" — mesmo nome que o Django espera

  const headers: Record<string, string> = {};
  const token = localStorage.getItem('authToken');
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    body: form,
    headers,
    // ⚠️ NÃO defina Content-Type manualmente — o browser seta o boundary do multipart automaticamente
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Erro ${response.status} ao analisar a imagem`,
    );
  }

  return response.json() as Promise<ClassificationResult>;
}
