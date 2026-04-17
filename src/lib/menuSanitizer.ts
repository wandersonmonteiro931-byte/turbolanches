const INGREDIENT_LIST_TERMS = [
  "pão",
  "pao",
  "hambúrguer",
  "hamburguer",
  "carne",
  "filé",
  "file",
  "presunto",
  "queijo",
  "mussarela",
  "ovo",
  "bacon",
  "salsicha",
  "milho",
  "ervilha",
  "batata palha",
  "alface",
  "tomate",
  "barbecue",
  "cheddar",
  "catupiry",
];

const INGREDIENT_LIST_START = /^(?:\+\s*)?(?:pão|pao|hambúrguer|hamburguer|carne|filé|file|presunto|queijo|mussarela|ovo|bacon|salsicha|milho|ervilha|batata palha|alface|tomate|barbecue|cheddar|catupiry)\b/i;
const INGREDIENT_LIST_AFTER_COM = /\bcom\s+(?:\+\s*)?(?:pão|pao|hambúrguer|hamburguer|carne|filé|file|presunto|queijo|mussarela|ovo|bacon|salsicha|milho|ervilha|batata palha|alface|tomate|barbecue|cheddar|catupiry)\b/i;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export function sanitizeCustomerDescription(value?: string | null) {
  const description = normalizeWhitespace(value ?? "");
  if (!description) return "";

  const normalized = description.toLowerCase();
  const keywordHits = INGREDIENT_LIST_TERMS.reduce(
    (total, term) => total + (normalized.includes(term) ? 1 : 0),
    0,
  );
  const commaCount = (description.match(/,/g) ?? []).length;
  const looksLikeIngredientList =
    keywordHits >= 5 && (commaCount >= 3 || INGREDIENT_LIST_START.test(description) || INGREDIENT_LIST_AFTER_COM.test(description));

  return looksLikeIngredientList ? "" : description;
}