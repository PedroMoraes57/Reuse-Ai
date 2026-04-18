import {
  API_BASE_URL,
  buildAuthHeaders,
  clearAuthToken,
  getApiErrorMessage,
  getAuthToken,
} from './api';

export interface GameProfileSummary {
  xp_total: number;
  level: number;
  level_title: string;
  current_streak: number;
  longest_streak: number;
  total_analyses: number;
  unique_materials: number;
  analysis_xp_total: number;
  quiz_xp_total: number;
  current_level_floor: number;
  next_level_floor: number;
  progress_to_next_level: number;
  progress_percent: number;
  xp_to_next_level: number;
}

export interface XpAward {
  amount: number;
  label: string;
}

export interface MissionCompletion {
  key: string;
  title: string;
  xp_reward: number;
  claimed_at: string;
}

export interface GameUpdate {
  profile: GameProfileSummary;
  xp_gained: number;
  awards: XpAward[];
  missions_completed: MissionCompletion[];
  leveled_up: boolean;
}

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export interface AnalysisQuiz {
  analysis_id: number;
  title: string;
  description: string;
  xp_per_correct_answer: number;
  questions: QuizQuestion[];
}

export interface QuizResultItem {
  question_id: string;
  selected_option_id: string;
  correct_option_id: string;
  correct_label: string;
  is_correct: boolean;
}

export interface QuizSubmissionResponse {
  analysis_id: number;
  correct_answers: number;
  total_questions: number;
  xp_gained: number;
  leveled_up: boolean;
  results: QuizResultItem[];
  profile: GameProfileSummary;
}

export interface GameMission {
  key: string;
  title: string;
  description: string;
  target: number;
  progress?: number;
  completed?: boolean;
  claimed?: boolean;
  xp_reward: number;
}

export interface RecentGameEvent {
  id: number;
  source: string;
  title: string;
  amount: number;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  weekly_xp: number;
  xp_total: number;
  level: number;
  level_title: string;
  total_analyses: number;
  current_streak: number;
}

export interface GameOverview {
  leaderboard: LeaderboardEntry[];
  period: {
    label: string;
    week_start: string;
    week_end: string;
  };
  community: {
    players: number;
    total_xp: number;
    total_analyses: number;
  };
  missions_preview: GameMission[];
  me?: {
    user_id: number;
    username: string;
    display_name: string;
    avatar_url?: string | null;
    rank?: number | null;
    profile: GameProfileSummary;
    missions: GameMission[];
    recent_events: RecentGameEvent[];
  };
}

async function fetchOverviewInternal(headers: HeadersInit) {
  const response = await fetch(`${API_BASE_URL}/game/overview/`, {
    headers,
  });

  if (!response.ok) {
    const error = new Error(
      await getApiErrorMessage(
        response,
        'Não foi possível carregar o ranking agora.',
      ),
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<GameOverview>;
}

export async function fetchGameOverview(): Promise<GameOverview> {
  const token = getAuthToken();

  try {
    return await fetchOverviewInternal(buildAuthHeaders());
  } catch (error) {
    if (
      !token ||
      !(error instanceof Error) ||
      (error as Error & { status?: number }).status !== 401
    ) {
      throw error;
    }

    clearAuthToken();
    return fetchOverviewInternal({});
  }
}

export async function submitQuizAnswers(
  analysisId: number,
  answers: Record<string, string>,
) {
  const response = await fetch(`${API_BASE_URL}/game/quiz/`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      analysis_id: analysisId,
      answers,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(
        response,
        'Não foi possível enviar suas respostas agora.',
      ),
    );
  }

  return response.json() as Promise<QuizSubmissionResponse>;
}
