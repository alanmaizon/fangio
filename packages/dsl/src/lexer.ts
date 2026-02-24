export type TokenType =
  | 'identifier'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | '{'
  | '}'
  | '['
  | ']'
  | ':'
  | ','
  | 'eof';

export interface Token {
  type: TokenType;
  value?: string | number | boolean | null;
  line: number;
  column: number;
}

export class FangioDslError extends Error {
  constructor(message: string, line: number, column: number) {
    super(`${message} (line ${line}, column ${column})`);
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const current = () => input[index];
  const advance = () => {
    const char = input[index];
    index += 1;
    if (char === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return char;
  };

  while (index < input.length) {
    const char = current();

    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      advance();
      continue;
    }

    if (char === '#') {
      while (index < input.length && current() !== '\n') {
        advance();
      }
      continue;
    }

    const startLine = line;
    const startColumn = column;

    if (char === '{' || char === '}' || char === '[' || char === ']' || char === ':' || char === ',') {
      tokens.push({ type: char, line: startLine, column: startColumn });
      advance();
      continue;
    }

    if (char === '"') {
      advance();
      let value = '';
      while (index < input.length && current() !== '"') {
        const part = advance();
        if (part === '\\') {
          if (index >= input.length) {
            throw new FangioDslError('Unterminated string escape', line, column);
          }
          value += part;
          value += advance();
          continue;
        }
        value += part;
      }
      if (current() !== '"') {
        throw new FangioDslError('Unterminated string literal', startLine, startColumn);
      }
      advance();
      tokens.push({
        type: 'string',
        value: JSON.parse(`"${value}"`) as string,
        line: startLine,
        column: startColumn,
      });
      continue;
    }

    if (/[0-9-]/.test(char)) {
      let raw = '';
      while (index < input.length && /[0-9.eE+-]/.test(current())) {
        raw += advance();
      }
      const value = Number(raw);
      if (Number.isNaN(value)) {
        throw new FangioDslError(`Invalid number "${raw}"`, startLine, startColumn);
      }
      tokens.push({ type: 'number', value, line: startLine, column: startColumn });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let value = '';
      while (index < input.length && /[A-Za-z0-9_.-]/.test(current())) {
        value += advance();
      }
      if (value === 'true' || value === 'false') {
        tokens.push({
          type: 'boolean',
          value: value === 'true',
          line: startLine,
          column: startColumn,
        });
      } else if (value === 'null') {
        tokens.push({ type: 'null', value: null, line: startLine, column: startColumn });
      } else {
        tokens.push({ type: 'identifier', value, line: startLine, column: startColumn });
      }
      continue;
    }

    throw new FangioDslError(`Unexpected character "${char}"`, startLine, startColumn);
  }

  tokens.push({ type: 'eof', line, column });
  return tokens;
}
