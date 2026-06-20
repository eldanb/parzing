import { ParseError, Parser, ParserContext, ParseResult } from "../core";

export class TokenParser<C = unknown> implements Parser<string, C> {
  constructor(private _token: string) {}

  parse(parserContext: ParserContext<C>): ParseResult<string> {
    const peeked = parserContext.input.peek(this._token.length);
    if (peeked === this._token) {
      parserContext.input.read(this._token.length);
      return ParseResult.successful(peeked);
    }

    if (peeked.length < this._token.length && this._token.startsWith(peeked)) {
      parserContext.onIncompleteParseOption();
    }

    return ParseResult.failed(
      ParseError.parserRejected(this, parserContext, `Expected token ${this._token}`),
    );
  }
}
