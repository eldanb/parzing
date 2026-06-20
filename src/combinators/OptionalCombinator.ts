import { Parser, ParserContext, ParseResult } from "../core";

export class OptionalCombinator<T, C = unknown> implements Parser<T | null, C> {
  constructor(private _parser: Parser<T, C>) {}

  parse(parserContext: ParserContext<C>): ParseResult<T | null> {
    const input = parserContext.input;

    const bm = input.getBookmark();
    const pce = parserContext.cutEncountered;

    parserContext.cutEncountered = false;
    let ret: ParseResult<T | null> = this._parser.parse(parserContext);

    if (!ret.successful && !parserContext.cutEncountered) {
      input.seekToBookmark(bm);
      ret = ParseResult.successful(null);
    }

    parserContext.cutEncountered = pce;
    return ret;
  }
}
