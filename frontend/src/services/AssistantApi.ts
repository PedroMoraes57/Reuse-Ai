import type { ClassificationResult } from './ClassificationApi';
import type { AssistantPageContext } from '../utils/assistantPageContext';
import { API_BASE_URL, buildAuthHeaders, getApiErrorMessage } from './api';

export type AssistantResponseType =
  | 'decision'
  | 'explanation'
  | 'alert'
  | 'clarification';

export interface AssistantMapRequest {
  kind: 'nearby_disposal_points';
  class_id: string;
  item_label: string;
  disposal_stream: string;
  prompt?: string | null;
}

export interface AssistantSessionSummary {
  id: number;
  title: string;
  last_message_preview: string;
  started_from_route?: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  read_only: boolean;
  is_active: boolean;
  message_count: number;
}

export interface AssistantSessionMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  created_at: string;
  response_type?: AssistantResponseType;
  action?: string | null;
  alert?: string | null;
  analysis_warning?: string | null;
  quick_replies?: string[];
  map_request?: AssistantMapRequest | null;
}

export interface AssistantSessionDetail {
  session: AssistantSessionSummary;
  messages: AssistantSessionMessage[];
}

export interface AssistantSessionListResponse {
  sessions: AssistantSessionSummary[];
}

export interface AssistantApiError extends Error {
  status?: number;
}

export interface AssistantReply {
  response_type: AssistantResponseType;
  answer: string;
  action?: string | null;
  alert?: string | null;
  analysis_warning?: string | null;
  quick_replies: string[];
  used_item_context: boolean;
  map_request?: AssistantMapRequest | null;
  session?: AssistantSessionSummary;
  referenced_item?: {
    class_id: string;
    display_name_pt: string;
  } | null;
}

export interface AssistantConversationMessage {
  role: 'assistant' | 'user';
  text: string;
}

export async function askAssistant(
  message: string,
  analysisContext: ClassificationResult | null,
  conversationContext: AssistantConversationMessage[] = [],
  pageContext?: AssistantPageContext,
  sessionId?: number | null,
): Promise<AssistantReply> {
  const headers = {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(),
  };

  const response = await fetch(`${API_BASE_URL}/chatbot/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      analysis_context: analysisContext,
      conversation_context: conversationContext,
      page_context: pageContext,
      session_id: sessionId ?? undefined,
    }),
  });

  if (!response.ok) {
    throw await buildAssistantApiError(
      response,
      'Nao foi possivel responder agora.',
    );
  }

  return response.json() as Promise<AssistantReply>;
}

export async function fetchAssistantSessions(): Promise<AssistantSessionListResponse> {
  const response = await fetch(`${API_BASE_URL}/chatbot/sessions/`, {
    method: 'GET',
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw await buildAssistantApiError(
      response,
      'Nao foi possivel carregar o historico do assistente.',
    );
  }

  return response.json() as Promise<AssistantSessionListResponse>;
}

export async function fetchAssistantSession(
  sessionId: number,
): Promise<AssistantSessionDetail> {
  const response = await fetch(`${API_BASE_URL}/chatbot/sessions/${sessionId}/`, {
    method: 'GET',
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw await buildAssistantApiError(
      response,
      'Nao foi possivel abrir essa conversa.',
    );
  }

  return response.json() as Promise<AssistantSessionDetail>;
}

export async function closeAssistantSession(
  sessionId: number,
): Promise<{ session: AssistantSessionSummary }> {
  const response = await fetch(
    `${API_BASE_URL}/chatbot/sessions/${sessionId}/close/`,
    {
      method: 'POST',
      headers: buildAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw await buildAssistantApiError(
      response,
      'Nao foi possivel encerrar essa conversa.',
    );
  }

  return response.json() as Promise<{ session: AssistantSessionSummary }>;
}

async function buildAssistantApiError(
  response: Response,
  fallbackMessage: string,
): Promise<AssistantApiError> {
  const error = new Error(
    await getApiErrorMessage(response, fallbackMessage),
  ) as AssistantApiError;
  error.status = response.status;
  return error;
}
