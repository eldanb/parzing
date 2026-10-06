import { Parser, ParserContext } from "../core";

// Tests whether `parser` matches here, or commits to matching here (fails after a cut), strictly,
// without consuming input, leaking cut/EOF state or firing completion events (it is speculative;
// a real parse at this position fires its own).
export function lookahead<C>(parserContext: ParserContext<C>, parser: Parser<unknown, C>): boolean {
  const input = parserContext.input;
  const bm = input.getBookmark();
  const cut = parserContext.cutEncountered;
  const ranIntoEof = parserContext.ranIntoEof;

  parserContext.cutEncountered = false;
  const r = parserContext.withoutCompletionEvents(() =>
    parserContext.strictly(() => parser.parse(parserContext)),
  );
  const committed = parserContext.cutEncountered;

  input.seekToBookmark(bm);
  parserContext.cutEncountered = cut;
  parserContext.ranIntoEof = ranIntoEof;
  return r.successful || committed;
}
