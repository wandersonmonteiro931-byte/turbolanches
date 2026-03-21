const MONEY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const parseLocaleNumber = (value?: string | number | null) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const sanitized = value.replace(/[^\d,.-]/g, "").trim();
  if (!sanitized) return null;

  const normalized = sanitized.includes(",")
    ? sanitized.replace(/\./g, "").replace(",", ".")
    : sanitized;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const formatCurrency = (value?: number | null) => MONEY_FORMATTER.format(roundMoney(value ?? 0));

export const formatMoneyInput = (value?: string | number | null) => {
  const parsed = parseLocaleNumber(value);
  if (parsed === null) return "";

  return roundMoney(parsed).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const parseRoundedMoney = (value?: string | number | null) => {
  const parsed = parseLocaleNumber(value);
  return parsed === null ? null : roundMoney(parsed);
};