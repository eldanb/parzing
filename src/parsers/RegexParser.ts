import { ParseError, Parser, ParserContext, ParseResult } from "../core";

export class RegexParser<C = unknown> implements Parser<string, C> {
  _charBitmap: number[] | null = null;

  constructor(private _regex: RegExp) {}

  parse(parserContext: ParserContext<C>): ParseResult<string> {
    if (!parserContext.input.readRegex) {
      throw ParseError.parserRejected(
        this,
        parserContext,
        "Input doesn't support regex parsing",
      );
    }

    if (parserContext.input.eof()) {
      parserContext.onIncompleteParseOption();
    }

    const reResult = parserContext.input.readRegex(this._regex);
    if (!reResult) {
      return ParseResult.failed(
        ParseError.parserRejected(
          this,
          parserContext,
          `Expected ${this._regex.source}`,
        ),
      );
    }

    return ParseResult.successful(reResult);
  }
}
