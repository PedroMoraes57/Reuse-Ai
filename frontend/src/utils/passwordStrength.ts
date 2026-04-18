export interface PasswordStrengthResult {
  label: string;
  score: number;
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      label: 'Digite uma senha para ver a força.',
    };
  }

  let score = 0;

  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;

  if (score <= 1) {
    return { score, label: 'Senha fraca' };
  }

  if (score === 2) {
    return { score, label: 'Senha razoável' };
  }

  if (score === 3) {
    return { score, label: 'Senha boa' };
  }

  return { score: 4, label: 'Senha forte' };
}
