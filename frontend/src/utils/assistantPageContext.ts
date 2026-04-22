export type AssistantPageContext = {
  id:
    | 'landing'
    | 'classification'
    | 'login'
    | 'register'
    | 'profile'
    | 'verify_email'
    | 'ranking'
    | 'friends'
    | 'battle'
    | 'public_profile'
    | 'forgot_password'
    | 'reset_password';
  pathname: string;
  label: string;
  description: string;
  quickReplies: string[];
};

type PageContextDefinition = Omit<AssistantPageContext, 'pathname'> & {
  pattern: RegExp;
};

const PAGE_CONTEXTS: PageContextDefinition[] = [
  {
    id: 'battle',
    pattern: /^\/amigos\/batalhas\/[^/]+$/,
    label: 'Batalha sustentável',
    description: 'Tire dúvidas sobre desafios, perguntas e resultado da batalha.',
    quickReplies: [
      'Como funciona a batalha?',
      'Como envio minhas respostas?',
      'Onde vejo o resultado?',
      'Essa batalha da XP?',
    ],
  },
  {
    id: 'public_profile',
    pattern: /^\/usuarios\/[^/]+$/,
    label: 'Perfil público',
    description: 'Posso explicar o que aparece no perfil público de um usuário.',
    quickReplies: [
      'O que aparece no perfil público?',
      'Como volto para meus amigos?',
      'Onde vejo batalhas desse usuário?',
      'Como envio amizade por aqui?',
    ],
  },
  {
    id: 'classification',
    pattern: /^\/classificar$/,
    label: 'Classificação com IA',
    description: 'Pergunte sobre análise de imagem, descarte, confiança e pontos próximos.',
    quickReplies: [
      'Como analisar uma imagem?',
      'Preciso login para classificar?',
      'O que significa confiança baixa?',
      'Posso ver pontos próximos de descarte?',
    ],
  },
  {
    id: 'login',
    pattern: /^\/login$/,
    label: 'Login',
    description: 'Tire dúvidas sobre acesso, Google, senha e sessão.',
    quickReplies: [
      'Posso entrar com Google?',
      'Esqueci minha senha',
      'Preciso confirmar e-mail?',
      'Preciso login para classificar?',
    ],
  },
  {
    id: 'register',
    pattern: /^\/cadastro$/,
    label: 'Cadastro',
    description: 'Posso explicar criação de conta, senha e verificação por e-mail.',
    quickReplies: [
      'Como criar conta?',
      'Posso usar foto no cadastro?',
      'Preciso confirmar o e-mail?',
      'Posso entrar com Google?',
    ],
  },
  {
    id: 'profile',
    pattern: /^\/profile$/,
    label: 'Perfil',
    description: 'Pergunte sobre avatar, nome de exibição, progresso e conta.',
    quickReplies: [
      'Como trocar minha foto?',
      'Como editar meu nome?',
      'Onde vejo meu progresso?',
      'Como sair da conta?',
    ],
  },
  {
    id: 'verify_email',
    pattern: /^\/verificar-email$/,
    label: 'Verificação de e-mail',
    description: 'Posso explicar ativação de conta e confirmação por e-mail.',
    quickReplies: [
      'Como confirmar meu e-mail?',
      'Posso reenviar a verificação?',
      'Preciso confirmar para entrar?',
      'O que fazer se o link expirou?',
    ],
  },
  {
    id: 'ranking',
    pattern: /^\/ranking$/,
    label: 'Ranking',
    description: 'Pergunte sobre XP, missões, progresso e posição semanal.',
    quickReplies: [
      'Como ganho XP?',
      'O que são missões?',
      'Como funciona o ranking semanal?',
      'Como subo de nível?',
    ],
  },
  {
    id: 'friends',
    pattern: /^\/amigos$/,
    label: 'Amigos',
    description: 'Tire dúvidas sobre amizade, busca de usuários e desafios.',
    quickReplies: [
      'Como adicionar um amigo?',
      'Como aceitar um pedido?',
      'Como desafiar alguém?',
      'Onde vejo minhas batalhas?',
    ],
  },
  {
    id: 'forgot_password',
    pattern: /^\/esqueci-senha$/,
    label: 'Recuperação de senha',
    description: 'Posso ajudar com redefinição e recuperação de acesso.',
    quickReplies: [
      'Como recuperar minha senha?',
      'Preciso do e-mail da conta?',
      'Quanto tempo demora o link?',
      'Posso entrar com Google?',
    ],
  },
  {
    id: 'reset_password',
    pattern: /^\/recuperar-senha$/,
    label: 'Redefinição de senha',
    description: 'Pergunte sobre nova senha e retomada do acesso.',
    quickReplies: [
      'Como redefino minha senha?',
      'O link expirou, e agora?',
      'Depois disso eu volto ao login?',
      'Preciso confirmar e-mail de novo?',
    ],
  },
  {
    id: 'landing',
    pattern: /^\/$/,
    label: 'Página inicial',
    description: 'Posso apresentar a plataforma e te orientar sobre por onde começar.',
    quickReplies: [
      'Como funciona a Reuse.AI?',
      'Onde eu classifico um item?',
      'Preciso criar conta?',
      'O que o projeto faz?',
    ],
  },
];

const FALLBACK_PAGE = PAGE_CONTEXTS[PAGE_CONTEXTS.length - 1];

export function getAssistantPageContext(pathname: string): AssistantPageContext {
  const normalizedPath = pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
  const match =
    PAGE_CONTEXTS.find(entry => entry.pattern.test(normalizedPath)) ?? FALLBACK_PAGE;

  return {
    id: match.id,
    pathname: normalizedPath,
    label: match.label,
    description: match.description,
    quickReplies: [...match.quickReplies],
  };
}
