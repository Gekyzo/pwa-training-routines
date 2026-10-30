// The pages of the walkthrough of the first start, in their order.
export const PAGES = ['welcome', 'offline'];

// The walkthrough shows at the start of a new install only: no seen flag and no stored state.
export const shouldShow = ({ seen, hasState }) => !seen && !hasState;

// The index of the page after a move of `direction` (1, -1 or 0). It stays in the pages.
export const step = (index, direction) => Math.min(Math.max(index + direction, 0), PAGES.length - 1);

export const isLast = (index) => index === PAGES.length - 1;

// A key that starts with `#name` shows the icon `name` of the sprite, then the rest of its text.
const keyPart = (text) => {
  const match = text.match(/^#([a-z][\w-]*)(?: (.*))?$/s);
  return match ? { text: match[2] ?? '', key: true, icon: match[1] } : { text, key: true };
};

const BOLD = '**';

// The parts of the text between keys, each one with its `strong` state. A pair of `**` marks
// bold text, also around a key; the last `**` of an odd count has no pair and stays in the text.
const boldParts = (parts) => {
  const marks = parts.filter((part) => !part.key).reduce((count, part) => count + part.text.split(BOLD).length - 1, 0);
  const paired = marks - (marks % 2);
  let seen = 0;
  let strong = false;
  return parts.flatMap((part) => {
    if (part.key) return [{ ...part, strong }];
    const [first, ...rest] = part.text.split(BOLD);
    const pieces = [{ text: first, key: false, strong }];
    rest.forEach((piece) => {
      seen += 1;
      if (seen > paired) {
        pieces.at(-1).text += BOLD + piece;
        return;
      }
      strong = !strong;
      pieces.push({ text: piece, key: false, strong });
    });
    return pieces;
  });
};

// A part has `strong: true` only in bold text.
const withStrong = ({ strong, ...part }) => (strong ? { ...part, strong: true } : part);

// The parts of a page text. A text between two backticks is a key, such as `↻` or `+`; a
// backtick with no pair stays in the text. A text between two `**` is bold.
export const textParts = (text) => {
  const pieces = text.split('`');
  // An even count of pieces means that the last backtick has no pair.
  const open = pieces.length % 2 === 0 ? pieces.splice(-2).join('`') : null;
  const parts = pieces.map((piece, index) => ({ text: piece, key: index % 2 === 1 }));
  if (open !== null) parts.push({ text: open, key: false });
  return boldParts(parts)
    .filter((part) => part.text)
    .reduce((joined, part) => {
      const last = joined.at(-1);
      if (last && !last.key && !part.key && last.strong === part.strong) last.text += part.text;
      else joined.push(part.key ? { ...keyPart(part.text), strong: part.strong } : { ...part });
      return joined;
    }, [])
    .map(withStrong);
};
