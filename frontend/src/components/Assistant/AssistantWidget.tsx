import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowsRotate,
  faClockRotateLeft,
  faLock,
  faPaperPlane,
  faRotateRight,
  faTag,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAssistant } from '../../contexts/useAssistant';
import { AssistantLocationMapCard } from './AssistantLocationMapCard';

const responseStyles = {
  decision: {
    badge: 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700/50',
    text: 'text-slate-700 dark:text-zinc-200',
    action: 'bg-teal-50 border border-teal-100 text-teal-800 dark:bg-teal-900/25 dark:border-teal-700/40 dark:text-teal-200',
    title: 'Ação prática',
  },
  explanation: {
    badge: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700/50',
    text: 'text-slate-700 dark:text-zinc-200',
    action: 'bg-sky-50 border border-sky-100 text-sky-800 dark:bg-sky-900/25 dark:border-sky-700/40 dark:text-sky-200',
    title: 'Explicação',
  },
  alert: {
    badge: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50',
    text: 'text-slate-700 dark:text-zinc-200',
    action: 'bg-amber-50 border border-amber-100 text-amber-800 dark:bg-amber-900/25 dark:border-amber-700/40 dark:text-amber-200',
    title: 'Alerta',
  },
  clarification: {
    badge: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-600',
    text: 'text-slate-700 dark:text-zinc-200',
    action: 'bg-slate-50 border border-slate-100 text-slate-700 dark:bg-zinc-700/50 dark:border-zinc-600 dark:text-zinc-200',
    title: 'Mais contexto',
  },
} as const;

function formatSessionTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AssistantWidget() {
  const {
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
    setAssistantOpen,
    sendMessage,
    askQuickQuestion,
    resetConversation,
    refreshSessions,
    openSession,
    requestMapForMessage,
  } = useAssistant();

  const [showHistory, setShowHistory] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    if (showHistory) {
      node.scrollTop = 0;
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, isSending, showHistory, sessions]);

  if (!isAuthenticated) {
    return null;
  }

  const contextLabel = lastAnalysis?.best_match?.display_name_pt;
  const isEmpty = messages.length === 0;
  const sessionTitle = currentSession?.title || 'Nova conversa';

  return (
    <div className='fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3'>
      {isOpen && (
        <section
          className='
            flex w-[min(92vw,26rem)] flex-col overflow-hidden
            rounded-2xl border shadow-2xl
            border-emerald-200/70 bg-white
            dark:border-emerald-900/50 dark:bg-zinc-900
          '
          style={{
            height: '700px',
            maxHeight: 'calc(100dvh - 7rem)',
          }}
        >
          <header
            className='
              flex-shrink-0 border-b px-4 py-3
              border-emerald-100 bg-emerald-50/80
              dark:border-emerald-900/60 dark:bg-emerald-950/40
            '
          >
            <div className='flex items-center justify-between gap-2'>
              <div className='flex min-w-0 items-center gap-2.5'>
                <span
                  className='
                    grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border
                    border-teal-200 bg-teal-50 text-teal-600
                    dark:border-teal-700/60 dark:bg-teal-900/30 dark:text-teal-400
                  '
                >
                  <FontAwesomeIcon
                    icon={faWandMagicSparkles}
                    className='text-xs'
                  />
                </span>
                <div className='min-w-0'>
                  <h2 className='text-sm font-semibold leading-tight text-slate-800 dark:text-zinc-100'>
                    Assistente Reuse.AI
                  </h2>
                  <p className='truncate text-xs text-slate-400 dark:text-zinc-500'>
                    {showHistory
                      ? 'Histórico de conversas'
                      : contextLabel
                        ? `Item: ${contextLabel}`
                        : currentPage.description}
                  </p>
                </div>
              </div>

              <div className='flex flex-shrink-0 items-center gap-1'>
                <button
                  type='button'
                  onClick={() => {
                    setShowHistory(previous => !previous);
                    if (!showHistory) {
                      void refreshSessions();
                    }
                  }}
                  className='
                    grid h-8 w-8 place-items-center rounded-lg transition
                    text-slate-400 hover:bg-slate-200/70 hover:text-slate-600
                    dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300
                  '
                  aria-label='Abrir histórico'
                  title='Histórico'
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} className='text-xs' />
                </button>
                {(messages.length > 0 || currentSession) && (
                  <button
                    type='button'
                    onClick={() => {
                      setShowHistory(false);
                      void resetConversation();
                    }}
                    className='
                      grid h-8 w-8 place-items-center rounded-lg transition
                      text-slate-400 hover:bg-slate-200/70 hover:text-slate-600
                      dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300
                    '
                    aria-label='Nova conversa'
                    title='Nova conversa'
                  >
                    <FontAwesomeIcon icon={faArrowsRotate} className='text-xs' />
                  </button>
                )}
                <button
                  type='button'
                  onClick={() => {
                    setShowHistory(false);
                    setAssistantOpen(false);
                  }}
                  className='
                    grid h-8 w-8 place-items-center rounded-lg transition
                    text-slate-400 hover:bg-slate-200/70 hover:text-slate-600
                    dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300
                  '
                  aria-label='Fechar assistente'
                >
                  <FontAwesomeIcon icon={faXmark} className='text-sm' />
                </button>
              </div>
            </div>

            <div className='mt-2.5 flex flex-wrap gap-1.5'>
              <span
                className='
                  inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                  bg-emerald-100 text-emerald-700
                  dark:bg-emerald-900/40 dark:text-emerald-400
                '
              >
                {currentPage.label}
              </span>
              {contextLabel && (
                <span
                  className='
                    inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium
                    border-teal-100 bg-teal-50 text-teal-600
                    dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-400
                  '
                >
                  <FontAwesomeIcon icon={faTag} className='text-[0.6rem]' />
                  {contextLabel}
                </span>
              )}
              {currentSession && (
                <span
                  className='
                    inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium
                    border-slate-200 bg-white text-slate-600
                    dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300
                  '
                  title={sessionTitle}
                >
                  {readOnly && <FontAwesomeIcon icon={faLock} className='text-[0.6rem]' />}
                  <span className='truncate max-w-[12rem]'>{sessionTitle}</span>
                </span>
              )}
            </div>
          </header>

          <div
            ref={listRef}
            className='
              min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4
              bg-emerald-50/30
              dark:bg-zinc-900
            '
          >
            {showHistory ? (
              <>
                <div
                  className='
                    rounded-xl border px-4 py-4 text-sm shadow-sm
                    border-slate-100 bg-slate-50 text-slate-500
                    dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-400
                  '
                >
                  <p className='font-medium text-slate-700 dark:text-zinc-200'>
                    Conversas salvas da sua conta
                  </p>
                  <p className='mt-1 leading-relaxed'>
                    Chats antigos ficam somente leitura para evitar reprocessamento
                    desnecessário. Quando quiser continuar, inicie uma conversa nova.
                  </p>
                </div>

                {isLoadingHistory && (
                  <div className='flex justify-start'>
                    <div
                      className='
                        inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-sm
                        border-slate-200 bg-white text-slate-500
                        dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400
                      '
                    >
                      <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500 dark:bg-teal-400' />
                      Carregando histórico...
                    </div>
                  </div>
                )}

                {!isLoadingHistory && sessions.length === 0 && (
                  <div
                    className='
                      rounded-xl border px-4 py-4 text-sm shadow-sm
                      border-slate-100 bg-white text-slate-500
                      dark:border-zinc-700/60 dark:bg-zinc-800/70 dark:text-zinc-400
                    '
                  >
                    Nenhuma conversa salva ainda. Assim que você usar o assistente,
                    o histórico vai aparecer aqui.
                  </div>
                )}

                {sessions.map(session => {
                  const isSelected = currentSession?.id === session.id;

                  return (
                    <button
                      key={session.id}
                      type='button'
                      onClick={() => {
                        setShowHistory(false);
                        void openSession(session.id);
                      }}
                      className={`
                        w-full rounded-2xl border px-3.5 py-3 text-left shadow-sm transition
                        ${
                          isSelected
                            ? 'border-teal-200 bg-teal-50 dark:border-teal-700/50 dark:bg-teal-900/20'
                            : 'border-slate-100 bg-white hover:border-teal-200 hover:bg-teal-50/40 dark:border-zinc-700/60 dark:bg-zinc-800/70 dark:hover:border-teal-700/40 dark:hover:bg-zinc-800'
                        }
                      `}
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <p className='min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-zinc-100'>
                          {session.title}
                        </p>
                        <span
                          className={`
                            flex-shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide
                            ${
                              session.read_only
                                ? 'bg-slate-100 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            }
                          `}
                        >
                          {session.read_only ? 'Leitura' : 'Ativa'}
                        </span>
                      </div>
                      <p className='mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-zinc-400'>
                        {session.last_message_preview || 'Sem prévia disponível.'}
                      </p>
                      <p className='mt-2 text-[0.7rem] text-slate-400 dark:text-zinc-500'>
                        Atualizada em {formatSessionTimestamp(session.updated_at)}
                      </p>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {isEmpty && (
                  <div
                    className='
                      rounded-xl border px-4 py-4 text-sm shadow-sm
                      border-slate-100 bg-slate-50 text-slate-500
                      dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-400
                    '
                  >
                    <p className='font-medium text-slate-700 dark:text-zinc-200'>
                      Pronto para responder.
                    </p>
                    <p className='mt-1 leading-relaxed'>
                      Posso explicar sustentabilidade, acessibilidade, reciclagem,
                      funcionalidades do sistema e agora também mostrar pontos
                      próximos de descarte quando isso fizer sentido.
                    </p>
                  </div>
                )}

                {messages.map(message => {
                  if (message.role === 'user') {
                    return (
                      <div key={message.id} className='flex justify-end'>
                        <div
                          className='
                            max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm shadow-sm
                            bg-emerald-800 text-white
                            dark:bg-emerald-900 dark:text-emerald-50
                          '
                        >
                          <p className='whitespace-pre-wrap break-words leading-relaxed'>
                            {message.text}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  const style =
                    responseStyles[message.responseType ?? 'decision'] ??
                    responseStyles.decision;

                  return (
                    <div key={message.id} className='flex justify-start'>
                      <article
                        className='
                          max-w-[92%] rounded-2xl rounded-bl-sm border px-3.5 py-3 text-sm shadow-sm
                          border-slate-100 bg-slate-50
                          dark:border-zinc-700/60 dark:bg-zinc-800/70
                        '
                      >
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${style.badge}`}
                        >
                          {style.title}
                        </span>
                        <p
                          className={`mt-2 whitespace-pre-wrap break-words leading-relaxed ${style.text}`}
                        >
                          {message.text}
                        </p>
                        {message.action && (
                          <p
                            className={`mt-2 whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm font-medium ${style.action}`}
                          >
                            {message.action}
                          </p>
                        )}
                        {message.alert && (
                          <p
                            className='
                              mt-2 whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm
                              border-amber-100 bg-amber-50 text-amber-700
                              dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300
                            '
                          >
                            {message.alert}
                          </p>
                        )}
                        {message.warning && (
                          <p
                            className='
                              mt-2 whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm
                              border-sky-100 bg-sky-50 text-sky-700
                              dark:border-sky-700/40 dark:bg-sky-900/20 dark:text-sky-300
                            '
                          >
                            {message.warning}
                          </p>
                        )}
                        {message.mapRequest && (
                          <AssistantLocationMapCard
                            messageId={message.id}
                            mapRequest={message.mapRequest}
                            mapState={message.mapState}
                            onRetry={requestMapForMessage}
                          />
                        )}
                      </article>
                    </div>
                  );
                })}

                {isSending && (
                  <div className='flex justify-start'>
                    <div
                      className='
                        inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-sm
                        border-slate-200 bg-white text-slate-500
                        dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400
                      '
                    >
                      <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500 dark:bg-teal-400' />
                      Processando...
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            className='
              flex-shrink-0 border-t px-4 py-3
              border-emerald-100 bg-white
              dark:border-emerald-900/50 dark:bg-zinc-900
            '
          >
            {showHistory ? (
              <div className='flex items-center justify-between gap-2'>
                <button
                  type='button'
                  onClick={() => setShowHistory(false)}
                  className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                >
                  Voltar para o chat
                </button>
                <button
                  type='button'
                  onClick={() => {
                    void refreshSessions();
                  }}
                  className='inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-100 dark:border-teal-700/40 dark:bg-teal-900/20 dark:text-teal-300 dark:hover:bg-teal-900/30'
                >
                  <FontAwesomeIcon icon={faRotateRight} className='text-[0.7rem]' />
                  Atualizar
                </button>
              </div>
            ) : readOnly ? (
              <div
                className='
                  rounded-xl border px-3.5 py-3 text-sm
                  border-slate-200 bg-slate-50
                  dark:border-zinc-700 dark:bg-zinc-800/80
                '
              >
                <p className='font-medium text-slate-700 dark:text-zinc-100'>
                  Este chat está em somente leitura.
                </p>
                <p className='mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400'>
                  Para continuar conversando sem reabrir um histórico antigo,
                  comece uma nova conversa.
                </p>
                <button
                  type='button'
                  onClick={() => {
                    setShowHistory(false);
                    void resetConversation();
                  }}
                  className='mt-3 inline-flex items-center gap-2 rounded-full bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600'
                >
                  <FontAwesomeIcon icon={faArrowsRotate} className='text-[0.7rem]' />
                  Nova conversa
                </button>
              </div>
            ) : (
              <>
                {quickReplies.length > 0 && (
                  <div className='mb-2.5 flex flex-wrap gap-1.5'>
                    {quickReplies.map(reply => (
                      <button
                        key={reply}
                        type='button'
                        onClick={() => {
                          void askQuickQuestion(reply);
                        }}
                        className='
                          max-w-[11rem] truncate rounded-full border px-2.5 py-1 text-xs transition
                          border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700
                          dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-teal-700/60 dark:hover:bg-teal-900/20 dark:hover:text-teal-300
                        '
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={event => {
                    event.preventDefault();
                    void sendMessage(draft);
                  }}
                  className='
                    flex items-end gap-2 rounded-xl border p-2
                    border-emerald-200/80 bg-emerald-50/60
                    dark:border-emerald-900/60 dark:bg-zinc-800/80
                  '
                >
                  <textarea
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        if (!isSending && draft.trim()) {
                          void sendMessage(draft);
                        }
                      }
                    }}
                    rows={1}
                    placeholder='Ex: onde descartar pilha perto de mim?'
                    className='
                      max-h-24 min-h-[2rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none
                      text-slate-800 placeholder:text-slate-400
                      dark:text-zinc-100 dark:placeholder:text-zinc-600
                    '
                  />
                  <button
                    type='submit'
                    disabled={isSending || !draft.trim()}
                    className='
                      grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-white transition
                      bg-teal-600 hover:bg-teal-700
                      disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400
                      dark:bg-teal-700 dark:hover:bg-teal-600
                      dark:disabled:bg-zinc-700 dark:disabled:text-zinc-600
                    '
                    aria-label='Enviar'
                  >
                    <FontAwesomeIcon icon={faPaperPlane} className='text-xs' />
                  </button>
                </form>

                <p className='mt-2 text-[0.68rem] text-slate-400 dark:text-zinc-600'>
                  Responde por contexto e intenção, guarda seu histórico e pode
                  buscar locais próximos quando a pergunta pedir isso.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      <button
        type='button'
        onClick={() => {
          if (isOpen) {
            setShowHistory(false);
          }
          setAssistantOpen(!isOpen);
        }}
        className='
          grid h-12 w-12 place-items-center rounded-full border shadow-md transition duration-200
          border-emerald-200 bg-white text-emerald-600
          hover:scale-105 hover:bg-emerald-50 hover:shadow-lg
          dark:border-emerald-800 dark:bg-zinc-800 dark:text-emerald-400
          dark:hover:bg-emerald-950/60 dark:hover:border-emerald-700
        '
        aria-label={isOpen ? 'Fechar assistente' : 'Abrir assistente'}
      >
        <FontAwesomeIcon icon={faWandMagicSparkles} className='text-lg' />
      </button>
    </div>
  );
}
