import type { ClassificationResult } from './ClassificationApi';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export type AssistantResponseType =
  | 'decision'
  | 'explanation'
  | 'alert'
  | 'clarification';

export interface AssistantReply {
  response_type: AssistantResponseType;
  answer: string;
  action: string;
  alert?: string | null;
  analysis_warning?: string | null;
  quick_replies: string[];
  used_item_context: boolean;
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
): Promise<AssistantReply> {
  const token = localStorage.getItem('authToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/chatbot/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      analysis_context: analysisContext,
      conversation_context: conversationContext,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel responder agora.');
  }

  return response.json() as Promise<AssistantReply>;
}
