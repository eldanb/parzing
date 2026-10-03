import { Parser, ParserContext } from "../core";

// Tests whether `parser` matches here, strictly, without consuming input or leaking cut/EOF state.
export function lookahead<C>(parserContext: ParserContext<C>, parser: Parser<unknown, C>): boolean {
  const input = parserContext.input;
  const bm = input.getBookmark();
  const cut = parserContext.cutEncountered;
  const ranIntoEof = parserContext.ranIntoEof;
  const r = parserContext.strictly(() => parser.parse(parserContext));
  input.seekToBookmark(bm);
  parserContext.cutEncountered = cut;
  parserContext.ranIntoEof = ranIntoEof;
  return r.successful;
}
