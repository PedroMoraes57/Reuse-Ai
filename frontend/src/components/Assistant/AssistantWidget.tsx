import { useEffect, useRef } from 'react';
import { useAssistant } from '../../contexts/useAssistant';

const responseStyles = {
  decision: {
    badge: 'bg-emerald-100 text-emerald-800',
    title: 'Acao pratica',
  },
  explanation: {
    badge: 'bg-sky-100 text-sky-800',
    title: 'Explicacao',
  },
  alert: {
    badge: 'bg-amber-100 text-amber-900',
    title: 'Alerta',
  },
  clarification: {
    badge: 'bg-slate-200 text-slate-700',
    title: 'Preciso de mais contexto',
  },
} as const;

export default function AssistantWidget() {
  const {
    isOpen,
    isSending,
    messages,
    quickReplies,
    draft,
    lastAnalysis,
    setDraft,
    setAssistantOpen,
    sendMessage,
    askQuickQuestion,
    resetConversation,
  } = useAssistant();

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, isSending]);

  const contextLabel = lastAnalysis?.best_match?.display_name_pt;
  const isEmpty = messages.length === 0;

  return (
    <div className='fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3'>
      {isOpen && (
        <section className='w-[min(92vw,24rem)] overflow-hidden rounded-[28px] border border-emerald-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]'>
          <header className='relative overflow-hidden border-b border-emerald-100 bg-[radial-gradient(circle_at_top_left,_rgba(22,163,74,0.22),_transparent_56%),linear-gradient(135deg,#052e16,#166534_55%,#16a34a)] px-5 py-4 text-white'>
            <div className='absolute -right-12 top-3 h-28 w-28 rounded-full bg-white/10 blur-2xl' />
            <div className='relative flex items-start justify-between gap-4'>
              <div>
                <p className='text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-100'>
                  Assistente Reuse.AI
                </p>
                <h2 className='mt-1 text-lg font-bold leading-tight'>
                  Respostas curtas para decidir o descarte
                </h2>
                <p className='mt-1 text-sm text-emerald-50/90'>
                  Pergunte o que fazer, por que nao recicla ou onde levar.
                </p>
                {contextLabel && (
                  <span className='mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white'>
                    <i className='fas fa-tag text-[0.7rem]' />
                    Ultimo item: {contextLabel}
                  </span>
                )}
              </div>

              <button
                type='button'
                onClick={() => setAssistantOpen(false)}
                className='grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/10 text-sm text-white transition hover:bg-white/20'
                aria-label='Fechar assistente'
              >
                <i className='fas fa-xmark' />
              </button>
            </div>
          </header>

          <div
            ref={listRef}
            className='max-h-[24rem] space-y-3 overflow-y-auto bg-slate-50 px-4 py-4'
          >
            {isEmpty && (
              <div className='rounded-3xl border border-dashed border-emerald-200 bg-white px-4 py-4 text-sm text-slate-600'>
                <p className='font-semibold text-slate-900'>O foco aqui e pratico.</p>
                <p className='mt-1'>
                  Eu respondo com o proximo passo mais seguro para o descarte.
                </p>
              </div>
            )}

            {messages.map(message => {
              if (message.role === 'user') {
                return (
                  <div key={message.id} className='flex justify-end'>
                    <div className='max-w-[85%] rounded-[22px] rounded-br-md bg-slate-900 px-4 py-3 text-sm text-white shadow-sm'>
                      {message.text}
                    </div>
                  </div>
                );
              }

              const style =
                responseStyles[message.responseType ?? 'decision'] ??
                responseStyles.decision;

              return (
                <div key={message.id} className='flex justify-start'>
                  <article className='max-w-[90%] rounded-[24px] rounded-bl-md border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-700 shadow-sm'>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] ${style.badge}`}
                    >
                      {style.title}
                    </span>
                    <p className='mt-2 leading-relaxed text-slate-900'>
                      {message.text}
                    </p>
                    {message.action && (
                      <p className='mt-2 rounded-2xl bg-emerald-50 px-3 py-2.5 font-medium text-emerald-900'>
                        {message.action}
                      </p>
                    )}
                    {message.alert && (
                      <p className='mt-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-amber-900'>
                        {message.alert}
                      </p>
                    )}
                    {message.warning && (
                      <p className='mt-2 rounded-2xl bg-sky-50 px-3 py-2.5 text-sky-900'>
                        {message.warning}
                      </p>
                    )}
                  </article>
                </div>
              );
            })}

            {isSending && (
              <div className='flex justify-start'>
                <div className='inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-sm'>
                  <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-500' />
                  Buscando a proxima acao...
                </div>
              </div>
            )}
          </div>

          <div className='border-t border-slate-200 bg-white px-4 py-4'>
            <div className='mb-3 flex flex-wrap gap-2'>
              {quickReplies.map(reply => (
                <button
                  key={reply}
                  type='button'
                  onClick={() => {
                    void askQuickQuestion(reply);
                  }}
                  className='rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100'
                >
                  {reply}
                </button>
              ))}
            </div>

            <form
              onSubmit={event => {
                event.preventDefault();
                void sendMessage(draft);
              }}
              className='rounded-[24px] border border-slate-200 bg-slate-50 p-2'
            >
              <div className='flex items-end gap-2'>
                <textarea
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  rows={2}
                  placeholder='Ex: onde descartar esse item?'
                  className='min-h-[3rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400'
                />
                <button
                  type='submit'
                  disabled={isSending || !draft.trim()}
                  className='grid h-11 w-11 place-items-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300'
                  aria-label='Enviar pergunta'
                >
                  <i className='fas fa-paper-plane text-sm' />
                </button>
              </div>
            </form>

            <div className='mt-3 flex items-center justify-between text-[0.72rem] text-slate-500'>
              <span>Resposta curta e orientada a acao.</span>
              {messages.length > 0 && (
                <button
                  type='button'
                  onClick={resetConversation}
                  className='font-semibold text-emerald-700 transition hover:text-emerald-800'
                >
                  Limpar conversa
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <button
        type='button'
        onClick={() => setAssistantOpen(!isOpen)}
        className='group flex items-center gap-3 rounded-full border border-emerald-300 bg-[linear-gradient(135deg,#022c22,#166534,#22c55e)] px-4 py-3 text-left text-white shadow-[0_18px_60px_rgba(22,163,74,0.32)] transition hover:-translate-y-0.5'
      >
        <span className='grid h-11 w-11 place-items-center rounded-full bg-white/15 text-lg'>
          <i className='fas fa-comments' />
        </span>
        <span>
          <strong className='block text-sm font-bold leading-tight'>
            Assistente de descarte
          </strong>
          <span className='block text-xs text-emerald-50/90'>
            Perguntas rapidas sem sair do fluxo
          </span>
        </span>
      </button>
    </div>
  );
}
