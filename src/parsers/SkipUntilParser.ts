import { Parser, ParserContext, ParseResult } from "../core";
import { lookahead } from "../utils/lookahead";

export class SkipUntilParser<C = unknown> implements Parser<string, C> {
  constructor(private _terminator: Parser<unknown, C>) {}

  parse(parserContext: ParserContext<C>): ParseResult<string> {
    const input = parserContext.input;
    const skipped: string[] = [];
    while (!input.eof() && !lookahead(parserContext, this._terminator)) {
      skipped.push(input.read(1));
    }

    return ParseResult.successful(skipped.join(""));
  }
}
