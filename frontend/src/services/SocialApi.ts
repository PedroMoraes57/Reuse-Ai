import { API_BASE_URL, buildAuthHeaders, getApiErrorMessage } from './api';
import type { GameProfileSummary } from './GamificationApi';

export interface SocialUserCard {
  id: number;
  username: string;
  display_name: string;
  full_name: string;
  avatar_url?: string | null;
  game_profile: GameProfileSummary;
}

export interface SocialRelationship {
  status:
    | 'anonymous'
    | 'self'
    | 'none'
    | 'friends'
    | 'incoming_request'
    | 'outgoing_request';
  friendship_id: number | null;
  requested_by: string | null;
  can_add_friend: boolean;
  can_challenge: boolean;
}

export interface PublicProfileResponse {
  user: SocialUserCard;
  relationship: SocialRelationship;
  social: {
    friends_count: number;
    battles_played: number;
    battles_won: number;
  };
}

export interface FriendshipSummary {
  id: number;
  status: string;
  created_at: string;
  responded_at?: string | null;
  user: SocialUserCard;
}

export interface FriendRequestSummary {
  id: number;
  created_at: string;
  user: SocialUserCard;
}

export interface BattleQuestionOption {
  id: string;
  label: string;
}

export interface BattleQuestion {
  id: string;
  index: number;
  prompt: string;
  options: BattleQuestionOption[];
  is_tiebreak: boolean;
  tiebreak_index: number;
  turn_user_id: number;
  turn_username: string;
  steal_user_id: number;
  steal_username: string;
  primary_answer_user_id: number | null;
  primary_answer_label: string;
  primary_is_correct: boolean | null;
  steal_answer_user_id: number | null;
  steal_answer_label: string;
  steal_is_correct: boolean | null;
  points_awarded_user_id: number | null;
  points_awarded: number;
  resolved: boolean;
  correct_label: string;
}

export interface BattleResultItem {
  question_id: string;
  is_tiebreak: boolean;
  tiebreak_index: number;
  primary_answer_user_id: number | null;
  primary_answer_label: string;
  primary_is_correct: boolean | null;
  steal_answer_user_id: number | null;
  steal_answer_label: string;
  steal_is_correct: boolean | null;
  points_awarded_user_id: number | null;
  points_awarded: number;
  correct_label: string;
  resolved: boolean;
}

export interface BattleSummary {
  id: number;
  status: 'pending' | 'active' | 'declined' | 'completed' | 'cancelled';
  title: string;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  question_count: number;
  resolved_questions: number;
  current_question_index: number;
  current_phase: 'primary' | 'steal' | 'completed';
  current_turn_user_id: number | null;
  current_turn_username: string | null;
  current_question_is_tiebreak: boolean;
  is_challenger: boolean;
  opponent: SocialUserCard;
  my_score: number;
  opponent_score: number;
  winner_user_id: number | null;
  can_respond_to_invite: boolean;
  is_my_turn: boolean;
  can_submit_turn: boolean;
  current_question?: BattleQuestion | null;
  questions?: BattleQuestion[];
  results: BattleResultItem[];
}

export interface SocialOverview {
  friends: FriendshipSummary[];
  incoming_requests: FriendRequestSummary[];
  outgoing_requests: FriendRequestSummary[];
  battles: {
    pending_received: BattleSummary[];
    pending_sent: BattleSummary[];
    active: BattleSummary[];
    completed: BattleSummary[];
  };
}

export interface SocialSearchResult {
  user: SocialUserCard;
  relationship: SocialRelationship;
}

export interface SocialSearchResponse {
  results: SocialSearchResult[];
}

export interface FriendActionResponse {
  detail: string;
  relationship: SocialRelationship;
  friendship?: FriendshipSummary;
}

export interface BattleActionResponse {
  detail: string;
  battle: BattleSummary;
}

export interface BattleDetailResponse {
  battle: BattleSummary;
}

export interface BattleSubmissionResponse {
  battle_id: number;
  status: string;
  winner_user_id: number | null;
  xp_gained: number;
  points_gained: number;
  answer_correct: boolean;
  battle: BattleSummary;
  profile: GameProfileSummary;
}

export interface SocialNotification {
  id: number;
  kind:
    | 'friend_request'
    | 'friend_accepted'
    | 'battle_invite'
    | 'battle_accepted'
    | 'battle_declined'
    | 'battle_turn'
    | 'battle_steal'
    | 'battle_completed';
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  battle_id: number | null;
  friendship_id: number | null;
  data: Record<string, string | number | boolean | null>;
  is_actionable: boolean;
}

export interface NotificationsResponse {
  unread_count: number;
  notifications: SocialNotification[];
}

async function ensureOk<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, fallbackMessage));
  }

  return response.json() as Promise<T>;
}

export async function fetchSocialOverview(): Promise<SocialOverview> {
  const response = await fetch(`${API_BASE_URL}/social/overview/`, {
    headers: buildAuthHeaders(),
  });
  return ensureOk<SocialOverview>(
    response,
    'Não foi possível carregar sua central social agora.',
  );
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await fetch(`${API_BASE_URL}/social/notifications/`, {
    headers: buildAuthHeaders(),
  });
  return ensureOk<NotificationsResponse>(
    response,
    'Não foi possível carregar as notificações agora.',
  );
}

export async function markNotificationsAsRead(ids?: number[]) {
  const response = await fetch(`${API_BASE_URL}/social/notifications/read/`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(ids?.length ? { ids } : {}),
  });
  return ensureOk<{ marked_count: number }>(
    response,
    'Não foi possível marcar as notificações como lidas.',
  );
}

export async function searchSocialUsers(query: string): Promise<SocialSearchResponse> {
  const params = new URLSearchParams();
  params.set('q', query);
  const response = await fetch(`${API_BASE_URL}/social/users/?${params.toString()}`, {
    headers: buildAuthHeaders(),
  });
  return ensureOk<SocialSearchResponse>(
    response,
    'Não foi possível buscar usuários agora.',
  );
}

export async function fetchPublicProfile(
  username: string,
): Promise<PublicProfileResponse> {
  const response = await fetch(`${API_BASE_URL}/social/profile/${username}/`, {
    headers: buildAuthHeaders(),
  });
  return ensureOk<PublicProfileResponse>(
    response,
    'Não foi possível carregar este perfil agora.',
  );
}

export async function sendFriendRequest(username: string) {
  const response = await fetch(`${API_BASE_URL}/social/friends/request/`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username }),
  });
  return ensureOk<FriendActionResponse>(
    response,
    'Não foi possível enviar o pedido de amizade.',
  );
}

export async function respondToFriendRequest(
  requestId: number,
  action: 'accept' | 'decline',
) {
  const response = await fetch(`${API_BASE_URL}/social/friends/requests/${requestId}/`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action }),
  });
  return ensureOk<FriendActionResponse>(
    response,
    'Não foi possível responder ao pedido de amizade.',
  );
}

export async function createBattle(username: string) {
  const response = await fetch(`${API_BASE_URL}/social/battles/`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username }),
  });
  return ensureOk<BattleActionResponse>(
    response,
    'Não foi possível criar a batalha agora.',
  );
}

export async function respondToBattle(
  battleId: number,
  action: 'accept' | 'decline',
) {
  const response = await fetch(`${API_BASE_URL}/social/battles/${battleId}/action/`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action }),
  });
  return ensureOk<BattleActionResponse>(
    response,
    'Não foi possível responder à batalha agora.',
  );
}

export async function fetchBattleDetail(battleId: number) {
  const response = await fetch(`${API_BASE_URL}/social/battles/${battleId}/`, {
    headers: buildAuthHeaders(),
  });
  return ensureOk<BattleDetailResponse>(
    response,
    'Não foi possível carregar a batalha agora.',
  );
}

export async function submitBattleAnswer(
  battleId: number,
  questionId: string,
  optionId: string,
) {
  const response = await fetch(`${API_BASE_URL}/social/battles/${battleId}/submit/`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      question_id: questionId,
      option_id: optionId,
    }),
  });
  return ensureOk<BattleSubmissionResponse>(
    response,
    'Não foi possível enviar sua resposta agora.',
  );
}
