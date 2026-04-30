/**
 * Normaliza string para busca: remove acentos, baixa caixa, trim.
 * Ex.: "São Lourenço" → "sao lourenco" === "SAO LOURENCO" → "sao lourenco"
 */
export const normalizeSearch = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .toLowerCase()
    .trim();
};

/**
 * True se `haystack` contém `needle` ignorando acentos e caixa.
 */
export const matchesSearch = (haystack: unknown, needle: unknown): boolean => {
  const n = normalizeSearch(needle);
  if (!n) return true;
  return normalizeSearch(haystack).includes(n);
};
