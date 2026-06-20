import { ParseError, Parser, ParserContext, ParseResult } from "../core";

export class WhitespaceParser<C = unknown> implements Parser<void, C> {
  constructor(private _mandatory: boolean) {}

  parse(parserContext: ParserContext<C>) {
    const input = parserContext.input;
    let c;
    let found = false;
    while (
      !input.eof() &&
      ((c = input.peek(1)), c == " " || c == "\t" || c == "\n")
    ) {
      input.read(1);
      found = true;
    }

    if (this._mandatory && !found) {
      return ParseResult.failed<void>(
        ParseError.parserRejected(this, parserContext),
      );
    } else {
      return ParseResult.voidSuccessful();
    }
  }
}
