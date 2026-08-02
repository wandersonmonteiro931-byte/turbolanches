// Contas da equipe podem entrar com e-mail OU com um usuário curto (login interno).
// O usuário curto é convertido em um e-mail interno determinístico, usado apenas pelo Auth.
export const STAFF_LOGIN_DOMAIN = "equipe.turbolanches.local";

export const normalizeStaffUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "");

export const isEmailLike = (value: string) => value.includes("@");

/** Converte "joao" em "joao@equipe.turbolanches.local". E-mails são mantidos como estão. */
export const resolveLoginEmail = (value: string) => {
  const raw = value.trim();
  if (isEmailLike(raw)) return raw.toLowerCase();
  const username = normalizeStaffUsername(raw);
  return username ? `${username}@${STAFF_LOGIN_DOMAIN}` : raw.toLowerCase();
};

export const isStaffInternalEmail = (value?: string | null) =>
  Boolean(value && value.toLowerCase().endsWith(`@${STAFF_LOGIN_DOMAIN}`));
