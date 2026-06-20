import { ParseError, Parser, ParserContext, ParseResult } from "../core";

export class TokenParser<C = unknown> implements Parser<string, C> {
  constructor(private _token: String) {}

  parse(parserContext: ParserContext<C>): ParseResult<string> {
    try {
      const str = parserContext.input.read(this._token.length);
      if (str !== this._token) {
        return ParseResult.failed(
          ParseError.parserRejected(
            this,
            parserContext,
            `Expected token ${this._token}`,
          ),
        );
      }

      return ParseResult.successful(str);
    } catch (e) {
      if (e instanceof ParseError) {
        return ParseResult.failed(e);
      }
      throw e;
    }
  }
}
