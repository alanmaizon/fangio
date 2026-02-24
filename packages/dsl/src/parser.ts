import { RiskLevelSchema } from '@fangio/schema';
import type { FangioPlanAst, FangioStepAst } from './ast.js';
import { FangioDslError, tokenize, type Token, type TokenType } from './lexer.js';

export function parseFangioScript(input: string): FangioPlanAst {
  const parser = new Parser(tokenize(input));
  return parser.parsePlan();
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parsePlan(): FangioPlanAst {
    this.expectIdentifier('plan');
    const goal = this.expectToken('string').value as string;
    this.expectToken('{');

    const ast: FangioPlanAst = { goal, steps: [] };
    while (!this.match('}')) {
      const keywordToken = this.expectToken('identifier');
      const keyword = keywordToken.value as string;
      if (keyword === 'planId') {
        ast.planId = this.expectToken('string').value as string;
        continue;
      }
      if (keyword === 'createdAt') {
        ast.createdAt = this.expectToken('string').value as string;
        continue;
      }
      if (keyword === 'metadata') {
        ast.metadata = this.parseMetadata();
        continue;
      }
      if (keyword === 'step') {
        ast.steps.push(this.parseStep());
        continue;
      }
      throw new FangioDslError(`Unexpected keyword "${keyword}"`, keywordToken.line, keywordToken.column);
    }

    this.expectToken('eof');
    return ast;
  }

  private parseMetadata() {
    this.expectToken('{');
    const metadata: FangioPlanAst['metadata'] = {
      traceId: '',
      channel: '',
      responseId: '',
    };
    while (!this.match('}')) {
      const key = this.expectToken('identifier');
      const value = this.expectToken('string').value as string;
      const field = key.value as string;
      if (field !== 'traceId' && field !== 'channel' && field !== 'responseId') {
        throw new FangioDslError(`Unexpected metadata field "${field}"`, key.line, key.column);
      }
      metadata[field] = value;
    }
    return metadata;
  }

  private parseStep(): FangioStepAst {
    const id = this.expectToken('string').value as string;
    this.expectToken('{');

    let tool: string | undefined;
    let risk: FangioStepAst['risk'] | undefined;
    let description: string | undefined;
    let approved: boolean | undefined;
    let approvedAt: string | undefined;
    let args: Record<string, unknown> | undefined;

    while (!this.match('}')) {
      const keyToken = this.expectToken('identifier');
      const key = keyToken.value as string;
      if (key === 'tool') {
        tool = this.expectToken('string').value as string;
        continue;
      }
      if (key === 'risk') {
        const riskToken = this.expectToken('identifier');
        risk = RiskLevelSchema.parse(riskToken.value);
        continue;
      }
      if (key === 'description') {
        description = this.expectToken('string').value as string;
        continue;
      }
      if (key === 'approved') {
        approved = this.expectToken('boolean').value as boolean;
        continue;
      }
      if (key === 'approvedAt') {
        approvedAt = this.expectToken('string').value as string;
        continue;
      }
      if (key === 'args') {
        const parsed = this.parseValue();
        if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new FangioDslError('args must be an object', keyToken.line, keyToken.column);
        }
        args = parsed as Record<string, unknown>;
        continue;
      }
      throw new FangioDslError(`Unexpected step field "${key}"`, keyToken.line, keyToken.column);
    }

    if (!tool) {
      throw new FangioDslError('step is missing required field "tool"', this.current().line, this.current().column);
    }
    if (!risk) {
      throw new FangioDslError('step is missing required field "risk"', this.current().line, this.current().column);
    }
    if (!description) {
      throw new FangioDslError(
        'step is missing required field "description"',
        this.current().line,
        this.current().column
      );
    }

    return {
      id,
      tool,
      risk,
      description,
      approved,
      approvedAt,
      args: args ?? {},
    };
  }

  private parseValue(): unknown {
    const token = this.current();
    if (token.type === 'string' || token.type === 'number' || token.type === 'boolean' || token.type === 'null') {
      this.index += 1;
      return token.value;
    }
    if (token.type === '[') {
      return this.parseArray();
    }
    if (token.type === '{') {
      return this.parseObject();
    }
    throw new FangioDslError(`Expected a value but found "${token.type}"`, token.line, token.column);
  }

  private parseObject(): Record<string, unknown> {
    const object: Record<string, unknown> = {};
    this.expectToken('{');

    while (!this.match('}')) {
      const keyToken = this.current();
      if (keyToken.type !== 'string' && keyToken.type !== 'identifier') {
        throw new FangioDslError('Object keys must be strings or identifiers', keyToken.line, keyToken.column);
      }
      this.index += 1;
      const key = String(keyToken.value);
      this.expectToken(':');
      object[key] = this.parseValue();
      if (!this.match(',')) {
        this.expectToken('}');
        break;
      }
    }
    return object;
  }

  private parseArray(): unknown[] {
    const values: unknown[] = [];
    this.expectToken('[');
    while (!this.match(']')) {
      values.push(this.parseValue());
      if (!this.match(',')) {
        this.expectToken(']');
        break;
      }
    }
    return values;
  }

  private expectIdentifier(value: string): void {
    const token = this.expectToken('identifier');
    if (token.value !== value) {
      throw new FangioDslError(`Expected keyword "${value}"`, token.line, token.column);
    }
  }

  private expectToken(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new FangioDslError(`Expected "${type}" but found "${token.type}"`, token.line, token.column);
    }
    this.index += 1;
    return token;
  }

  private match(type: TokenType): boolean {
    if (this.current().type !== type) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private current(): Token {
    return this.tokens[this.index];
  }
}
