import { compileAstToPlan } from './compiler.js';
import { FangioDslError } from './lexer.js';
import { parseFangioScript } from './parser.js';

export { compileAstToPlan, FangioDslError, parseFangioScript };

export function compileFangioScript(source: string) {
  return compileAstToPlan(parseFangioScript(source));
}
