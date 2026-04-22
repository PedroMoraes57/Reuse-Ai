import { createContext } from 'react';
import type { ClassificationResult } from '../services/ClassificationApi';
import type { AssistantReply } from '../services/AssistantApi';

export type AssistantMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  action?: string;
  alert?: string | null;
  warning?: string | null;
  responseType?: AssistantReply['response_type'];
};

export type AssistantContextValue = {
  isOpen: boolean;
  isSending: boolean;
  messages: AssistantMessage[];
  quickReplies: string[];
  draft: string;
  lastAnalysis: ClassificationResult | null;
  setDraft: (value: string) => void;
  setAssistantOpen: (value: boolean) => void;
  setAnalysisContext: (value: ClassificationResult | null) => void;
  sendMessage: (value: string) => Promise<void>;
  askQuickQuestion: (value: string) => Promise<void>;
  resetConversation: () => void;
};

export const AssistantContext = createContext<AssistantContextValue | undefined>(
  undefined,
);
