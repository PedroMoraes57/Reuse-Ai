import { createContext } from 'react';
import type {
  ClassificationResult,
  NearbyDisposalPointsResponse,
} from '../services/ClassificationApi';
import type {
  AssistantMapRequest,
  AssistantReply,
  AssistantSessionSummary,
} from '../services/AssistantApi';
import type { AssistantPageContext } from '../utils/assistantPageContext';

export type AssistantMapState = {
  status:
    | 'idle'
    | 'requesting_permission'
    | 'loading_points'
    | 'ready'
    | 'denied'
    | 'unsupported'
    | 'error';
  error?: string | null;
  nearbyResponse?: NearbyDisposalPointsResponse | null;
};

export type AssistantMessage = {
  id: string;
  serverId?: number;
  role: 'assistant' | 'user';
  text: string;
  createdAt?: string;
  action?: string;
  alert?: string | null;
  warning?: string | null;
  quickReplies?: string[];
  responseType?: AssistantReply['response_type'];
  mapRequest?: AssistantMapRequest | null;
  mapState?: AssistantMapState;
};

export type AssistantContextValue = {
  isAuthenticated: boolean;
  isOpen: boolean;
  isSending: boolean;
  isLoadingHistory: boolean;
  messages: AssistantMessage[];
  sessions: AssistantSessionSummary[];
  currentSession: AssistantSessionSummary | null;
  readOnly: boolean;
  quickReplies: string[];
  draft: string;
  lastAnalysis: ClassificationResult | null;
  currentPage: AssistantPageContext;
  setDraft: (value: string) => void;
  setAssistantOpen: (value: boolean) => void;
  setAnalysisContext: (value: ClassificationResult | null) => void;
  sendMessage: (value: string) => Promise<void>;
  askQuickQuestion: (value: string) => Promise<void>;
  resetConversation: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  openSession: (sessionId: number) => Promise<void>;
  requestMapForMessage: (messageId: string) => Promise<void>;
};

export const AssistantContext = createContext<AssistantContextValue | undefined>(
  undefined,
);
