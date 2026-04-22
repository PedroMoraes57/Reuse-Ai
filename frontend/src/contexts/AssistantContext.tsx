import { useEffect, useState, type ReactNode } from 'react';
import { askAssistant } from '../services/AssistantApi';
import type { ClassificationResult } from '../services/ClassificationApi';
import {
  AssistantContext,
  type AssistantContextValue,
  type AssistantMessage,
} from './assistantContextStore';

const STORAGE_KEY = 'reuse-ai:last-analysis';

const DEFAULT_QUICK_REPLIES = [
  'Como reduzir lixo em casa?',
  'O que e coleta seletiva?',
  'Precisa lavar embalagem para reciclar?',
  'Onde descartar oleo de cozinha?',
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
    text: 'Ainda nao consegui responder com seguranca.',
    action: text,
    responseType: 'clarification',
  };
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

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState(DEFAULT_QUICK_REPLIES);
  const [lastAnalysis, setLastAnalysis] = useState<ClassificationResult | null>(
    () => {
      if (typeof window === 'undefined') {
        return null;
      }
      return parseStoredAnalysis();
    },
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (lastAnalysis) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lastAnalysis));
      setQuickReplies([
        'O que eu faco com isso?',
        'Onde descartar esse item?',
        'Por que esse item nao vai na reciclavel?',
        'Como preparar antes de descartar?',
      ]);
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    setQuickReplies(DEFAULT_QUICK_REPLIES);
  }, [lastAnalysis]);

  async function sendMessage(value: string) {
    const text = value.trim();
    if (!text || isSending) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: createId(),
      role: 'user',
      text,
    };
    const nextConversation = [...messages, userMessage]
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
      const reply = await askAssistant(text, lastAnalysis, nextConversation);
      const assistantMessage: AssistantMessage = {
        id: createId(),
        role: 'assistant',
        text: reply.answer,
        action: reply.action,
        alert: reply.alert,
        warning: reply.analysis_warning,
        responseType: reply.response_type,
      };
      setMessages(previous => [...previous, assistantMessage]);
      setQuickReplies(
        reply.quick_replies.length ? reply.quick_replies : DEFAULT_QUICK_REPLIES,
      );
    } catch (error) {
      setMessages(previous => [...previous, createErrorMessage(error)]);
    } finally {
      setIsSending(false);
    }
  }

  async function askQuickQuestion(value: string) {
    setIsOpen(true);
    await sendMessage(value);
  }

  function resetConversation() {
    setMessages([]);
  }

  const contextValue: AssistantContextValue = {
    isOpen,
    isSending,
    messages,
    quickReplies,
    draft,
    lastAnalysis,
    setDraft,
    setAssistantOpen: setIsOpen,
    setAnalysisContext: setLastAnalysis,
    sendMessage,
    askQuickQuestion,
    resetConversation,
  };

  return (
    <AssistantContext.Provider value={contextValue}>
      {children}
    </AssistantContext.Provider>
  );
}
