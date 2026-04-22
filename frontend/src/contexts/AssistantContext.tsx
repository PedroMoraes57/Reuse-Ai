import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { me } from '../services/AuthApi';
import {
  askAssistant,
  closeAssistantSession,
  fetchAssistantSession,
  fetchAssistantSessions,
  type AssistantApiError,
  type AssistantMapRequest,
  type AssistantSessionDetail,
  type AssistantSessionMessage,
  type AssistantSessionSummary,
} from '../services/AssistantApi';
import type {
  ClassificationResult,
  NearbyDisposalPointsResponse,
} from '../services/ClassificationApi';
import { fetchNearbyDisposalPoints } from '../services/ClassificationApi';
import { clearAuthToken, getAuthToken } from '../services/api';
import {
  AssistantContext,
  type AssistantContextValue,
  type AssistantMapState,
  type AssistantMessage,
} from './assistantContextStore';
import { getAssistantPageContext } from '../utils/assistantPageContext';
import { dispatchUserCleared, subscribeToUserSync } from '../utils/userSync';

const STORAGE_KEY = 'reuse-ai:last-analysis';

const DEFAULT_QUICK_REPLIES = [
  'Como funciona a Reuse.AI?',
  'Onde descartar pilhas?',
  'O que e acessibilidade digital?',
  'Como funciona o ranking?',
];

const ANALYSIS_QUICK_REPLIES = [
  'O que eu faco com isso?',
  'Onde descartar esse item?',
  'Por que esse item nao vai na reciclavel?',
  'Como preparar antes de descartar?',
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createErrorMessage(error: unknown): AssistantMessage {
  const text =
    error instanceof Error
      ? error.message
      : 'Nao consegui responder agora. Tente novamente em instantes.';

  return {
    id: createId(),
    role: 'assistant',
    text: 'Nao consegui concluir essa resposta agora.',
    action: text,
    responseType: 'clarification',
  };
}

function isDisplayableSupportText(value?: string | null): value is string {
  if (!value) {
    return false;
  }
  const text = value.trim();
  if (!text) {
    return false;
  }
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+){1,6}$/i.test(text)) {
    return false;
  }
  return true;
}

function parseStoredAnalysis(): ClassificationResult | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as ClassificationResult;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function resolveDefaultQuickReplies(
  currentPage: ReturnType<typeof getAssistantPageContext>,
  lastAnalysis: ClassificationResult | null,
) {
  if (lastAnalysis) {
    return ANALYSIS_QUICK_REPLIES;
  }

  return currentPage.quickReplies.length
    ? currentPage.quickReplies
    : DEFAULT_QUICK_REPLIES;
}

function sortSessions(sessions: AssistantSessionSummary[]) {
  return [...sessions].sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  );
}

function getLastAssistantQuickReplies(messages: AssistantMessage[]) {
  const assistantMessage = [...messages]
    .reverse()
    .find(message => message.role === 'assistant' && message.quickReplies?.length);

  return assistantMessage?.quickReplies ?? [];
}

function createInitialMapState(
  mapRequest?: AssistantMapRequest | null,
): AssistantMapState | undefined {
  return mapRequest ? { status: 'idle' } : undefined;
}

function toAssistantMessage(
  message: AssistantSessionMessage,
): AssistantMessage {
  if (message.role === 'user') {
    return {
      id: `server-${message.id}`,
      serverId: message.id,
      role: 'user',
      text: message.text,
      createdAt: message.created_at,
    };
  }

  return {
    id: `server-${message.id}`,
    serverId: message.id,
    role: 'assistant',
    text: message.text,
    createdAt: message.created_at,
    action: isDisplayableSupportText(message.action) ? message.action : undefined,
    alert: isDisplayableSupportText(message.alert) ? message.alert : undefined,
    warning: isDisplayableSupportText(message.analysis_warning)
      ? message.analysis_warning
      : undefined,
    quickReplies: message.quick_replies ?? [],
    responseType: message.response_type,
    mapRequest: message.map_request ?? null,
    mapState: createInitialMapState(message.map_request),
  };
}

function toAssistantMessages(detail: AssistantSessionDetail) {
  return detail.messages.map(toAssistantMessage);
}

function resolveLocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      status: 'denied' as const,
      error: 'Permita sua localizacao para eu mostrar os pontos proximos no mapa.',
    };
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return {
      status: 'error' as const,
      error: 'Nao consegui descobrir sua localizacao agora.',
    };
  }

  return {
    status: 'error' as const,
    error: 'A localizacao demorou demais. Tente novamente.',
  };
}

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 120000,
    });
  });
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(getAuthToken()),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [sessions, setSessions] = useState<AssistantSessionSummary[]>([]);
  const [currentSession, setCurrentSession] =
    useState<AssistantSessionSummary | null>(null);
  const [quickReplies, setQuickReplies] = useState(DEFAULT_QUICK_REPLIES);
  const [lastAnalysis, setLastAnalysis] = useState<ClassificationResult | null>(
    () => {
      if (typeof window === 'undefined') {
        return null;
      }
      return parseStoredAnalysis();
    },
  );
  const currentPage = useMemo(
    () => getAssistantPageContext(location.pathname),
    [location.pathname],
  );
  const historyBootstrappedRef = useRef(false);
  const messagesRef = useRef<AssistantMessage[]>([]);

  const readOnly = currentSession?.read_only ?? false;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (lastAnalysis) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lastAnalysis));
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
  }, [lastAnalysis]);

  useEffect(() => {
    if (readOnly) {
      setQuickReplies([]);
      return;
    }

    const conversationReplies = getLastAssistantQuickReplies(messages);
    if (conversationReplies.length > 0) {
      setQuickReplies(conversationReplies);
      return;
    }

    setQuickReplies(resolveDefaultQuickReplies(currentPage, lastAnalysis));
  }, [currentPage, lastAnalysis, messages, readOnly]);

  useEffect(() => {
    let cancelled = false;

    async function syncAuthFromToken() {
      if (!getAuthToken()) {
        historyBootstrappedRef.current = false;
        if (!cancelled) {
          setIsAuthenticated(false);
          setMessages([]);
          setSessions([]);
          setCurrentSession(null);
          setDraft('');
        }
        return;
      }

      try {
        await me();
        if (!cancelled) {
          setIsAuthenticated(true);
        }
      } catch {
        clearAuthToken();
        historyBootstrappedRef.current = false;
        if (!cancelled) {
          setIsAuthenticated(false);
          setMessages([]);
          setSessions([]);
          setCurrentSession(null);
          setDraft('');
        }
      }
    }

    void syncAuthFromToken();

    const unsubscribe = subscribeToUserSync(
      () => {
        if (!cancelled) {
          setIsAuthenticated(true);
          historyBootstrappedRef.current = false;
        }
      },
      () => {
        clearAuthToken();
        historyBootstrappedRef.current = false;
        if (!cancelled) {
          setIsAuthenticated(false);
          setMessages([]);
          setSessions([]);
          setCurrentSession(null);
          setDraft('');
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !isAuthenticated || historyBootstrappedRef.current) {
      return;
    }

    let cancelled = false;

    async function bootstrapHistory() {
      setIsLoadingHistory(true);
      try {
        const response = await fetchAssistantSessions();
        if (cancelled) {
          return;
        }

        const sortedSessions = sortSessions(response.sessions);
        setSessions(sortedSessions);
        historyBootstrappedRef.current = true;

        if (!currentSession && messagesRef.current.length === 0) {
          const activeSession = sortedSessions.find(session => session.is_active);
          if (activeSession) {
            const detail = await fetchAssistantSession(activeSession.id);
            if (cancelled) {
              return;
            }
            setCurrentSession(detail.session);
            setMessages(toAssistantMessages(detail));
          }
        }
      } catch (error) {
        const apiError = error as AssistantApiError;
        if (apiError.status === 401) {
          clearAuthToken();
          historyBootstrappedRef.current = false;
          if (!cancelled) {
            setIsAuthenticated(false);
            setMessages([]);
            setSessions([]);
            setCurrentSession(null);
            setDraft('');
          }
          dispatchUserCleared();
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    }

    void bootstrapHistory();

    return () => {
      cancelled = true;
    };
  }, [currentSession, isAuthenticated, isOpen]);

  function applySignedOutState() {
    clearAuthToken();
    historyBootstrappedRef.current = false;
    setIsAuthenticated(false);
    setMessages([]);
    setSessions([]);
    setCurrentSession(null);
    setDraft('');
  }

  function upsertSessionSummary(session: AssistantSessionSummary) {
    setSessions(previous =>
      sortSessions([session, ...previous.filter(entry => entry.id !== session.id)]),
    );
    setCurrentSession(previous =>
      previous?.id === session.id ? session : previous,
    );
  }

  function updateMessage(messageId: string, nextMessage: Partial<AssistantMessage>) {
    setMessages(previous =>
      previous.map(message =>
        message.id === messageId ? { ...message, ...nextMessage } : message,
      ),
    );
  }

  function updateMessageMapState(messageId: string, mapState: AssistantMapState) {
    updateMessage(messageId, { mapState });
  }

  async function handleUnauthorizedResponse() {
    applySignedOutState();
    dispatchUserCleared();
  }

  async function refreshSessions() {
    if (!isAuthenticated) {
      return;
    }

    setIsLoadingHistory(true);
    try {
      const response = await fetchAssistantSessions();
      const sortedSessions = sortSessions(response.sessions);
      setSessions(sortedSessions);
      historyBootstrappedRef.current = true;
      setCurrentSession(previous =>
        previous ? sortedSessions.find(session => session.id === previous.id) ?? previous : previous,
      );
    } catch (error) {
      const apiError = error as AssistantApiError;
      if (apiError.status === 401) {
        await handleUnauthorizedResponse();
      } else {
        throw error;
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function openSession(sessionId: number) {
    if (!isAuthenticated) {
      return;
    }

    setIsOpen(true);
    setIsLoadingHistory(true);

    try {
      const detail = await fetchAssistantSession(sessionId);
      setCurrentSession(detail.session);
      setMessages(toAssistantMessages(detail));
      upsertSessionSummary(detail.session);
      setDraft('');
    } catch (error) {
      const apiError = error as AssistantApiError;
      if (apiError.status === 401) {
        await handleUnauthorizedResponse();
        return;
      }
      setMessages(previous => [...previous, createErrorMessage(error)]);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function resolveMapForMessage(
    messageId: string,
    mapRequest: AssistantMapRequest | null | undefined,
  ) {
    if (!mapRequest || mapRequest.kind !== 'nearby_disposal_points') {
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      updateMessageMapState(messageId, {
        status: 'unsupported',
        error:
          'Seu navegador nao liberou geolocalizacao para eu mostrar pontos proximos.',
      });
      return;
    }

    updateMessageMapState(messageId, { status: 'requesting_permission' });

    try {
      const position = await getCurrentPosition();
      updateMessageMapState(messageId, { status: 'loading_points' });

      const nearbyResponse: NearbyDisposalPointsResponse =
        await fetchNearbyDisposalPoints({
          disposalStream: mapRequest.disposal_stream,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

      updateMessageMapState(messageId, {
        status: 'ready',
        nearbyResponse,
      });
    } catch (error) {
      if (
        typeof GeolocationPositionError !== 'undefined' &&
        error instanceof GeolocationPositionError
      ) {
        updateMessageMapState(messageId, resolveLocationError(error));
        return;
      }

      const apiError = error as AssistantApiError;
      if (apiError.status === 401) {
        await handleUnauthorizedResponse();
        return;
      }

      updateMessageMapState(messageId, {
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Nao consegui carregar os pontos proximos agora.',
      });
    }
  }

  async function requestMapForMessage(messageId: string) {
    const message = messagesRef.current.find(entry => entry.id === messageId);
    if (!message?.mapRequest) {
      return;
    }
    await resolveMapForMessage(messageId, message.mapRequest);
  }

  async function sendMessage(value: string) {
    const text = value.trim();
    if (!text || isSending || !isAuthenticated || readOnly) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: createId(),
      role: 'user',
      text,
    };
    const nextConversation = [...messagesRef.current, userMessage]
      .slice(-6)
      .map(messageEntry => ({
        role: messageEntry.role,
        text: messageEntry.text,
      }));

    setMessages(previous => [...previous, userMessage]);
    setDraft('');
    setIsSending(true);
    setIsOpen(true);

    try {
      const reply = await askAssistant(
        text,
        lastAnalysis,
        nextConversation,
        currentPage,
        currentSession?.id ?? null,
      );
      const assistantMessage: AssistantMessage = {
        id: createId(),
        role: 'assistant',
        text: reply.answer,
        action: isDisplayableSupportText(reply.action) ? reply.action : undefined,
        alert: isDisplayableSupportText(reply.alert) ? reply.alert : undefined,
        warning: isDisplayableSupportText(reply.analysis_warning)
          ? reply.analysis_warning
          : undefined,
        quickReplies: reply.quick_replies,
        responseType: reply.response_type,
        mapRequest: reply.map_request ?? null,
        mapState: createInitialMapState(reply.map_request),
      };

      setMessages(previous => [...previous, assistantMessage]);

      if (reply.session) {
        setCurrentSession(reply.session);
        upsertSessionSummary(reply.session);
      }

      if (reply.map_request) {
        void resolveMapForMessage(assistantMessage.id, reply.map_request);
      }
    } catch (error) {
      const apiError = error as AssistantApiError;
      if (apiError.status === 401) {
        await handleUnauthorizedResponse();
        return;
      }

      if (apiError.status === 409 && currentSession) {
        const closedSession: AssistantSessionSummary = {
          ...currentSession,
          read_only: true,
          is_active: false,
          closed_at: currentSession.closed_at ?? new Date().toISOString(),
        };
        upsertSessionSummary(closedSession);
        setCurrentSession(closedSession);
      }

      setMessages(previous => [...previous, createErrorMessage(error)]);
    } finally {
      setIsSending(false);
    }
  }

  async function askQuickQuestion(value: string) {
    setIsOpen(true);
    await sendMessage(value);
  }

  async function resetConversation() {
    if (!isAuthenticated) {
      return;
    }

    if (currentSession && !currentSession.read_only && messagesRef.current.length > 0) {
      try {
        const response = await closeAssistantSession(currentSession.id);
        upsertSessionSummary(response.session);
      } catch (error) {
        const apiError = error as AssistantApiError;
        if (apiError.status === 401) {
          await handleUnauthorizedResponse();
          return;
        }
      }
    }

    setMessages([]);
    setCurrentSession(null);
    setDraft('');
    await refreshSessions();
  }

  const contextValue: AssistantContextValue = {
    isAuthenticated,
    isOpen,
    isSending,
    isLoadingHistory,
    messages,
    sessions,
    currentSession,
    readOnly,
    quickReplies,
    draft,
    lastAnalysis,
    currentPage,
    setDraft,
    setAssistantOpen: setIsOpen,
    setAnalysisContext: setLastAnalysis,
    sendMessage,
    askQuickQuestion,
    resetConversation,
    refreshSessions,
    openSession,
    requestMapForMessage,
  };

  return (
    <AssistantContext.Provider value={contextValue}>
      {children}
    </AssistantContext.Provider>
  );
}
