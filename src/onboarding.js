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

// The parts of a page text. A text between two backticks is a key, such as `↻` or `+`; a
// backtick with no pair stays in the text.
export const textParts = (text) => {
  const pieces = text.split('`');
  // An even count of pieces means that the last backtick has no pair.
  const open = pieces.length % 2 === 0 ? pieces.splice(-2).join('`') : null;
  const parts = pieces.map((piece, index) => ({ text: piece, key: index % 2 === 1 }));
  if (open !== null) parts.push({ text: open, key: false });
  return parts
    .filter((part) => part.text)
    .reduce((joined, part) => {
      const last = joined.at(-1);
      if (last && !last.key && !part.key) last.text += part.text;
      else joined.push(part.key ? keyPart(part.text) : { ...part });
      return joined;
    }, []);
};
