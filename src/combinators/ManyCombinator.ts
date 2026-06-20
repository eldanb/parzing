import {
  ParseError,
  Parser,
  ParserContext,
  ParseResult,
  ParserWithInternalWhitespaceSupport,
} from "../core";

export class ManyCombinator<T, C = unknown> extends ParserWithInternalWhitespaceSupport<
  T[],
  C
> {
  constructor(
    private _parser: Parser<T, C>,
    private _sepParser?: Parser<unknown, C>,
    private _min: number = 0,
    private _max: number = 0,
  ) {
    super();
  }

  parse(parserContext: ParserContext<C>): ParseResult<T[]> {
    const output: T[] = [];

    const pce = parserContext.cutEncountered;
    let mustParseElement: boolean = false;

    try {
      do {
        // Parse element
        let bm = parserContext.input.getBookmark();
        parserContext.cutEncountered = false;
        const psr = this._parser.parse(parserContext);
        if (psr.successful) {
          output.push(psr.result);
        } else {
          if (mustParseElement || parserContext.cutEncountered) {
            return ParseResult.failed(psr.parseError);
          } else {
            parserContext.input.seekToBookmark(bm);
            break;
          }
        }

        mustParseElement = false;

        // Parse WS
        parserContext.cutEncountered = false;
        let wpr = this.parseWhitespace(parserContext);
        if (!wpr.successful) {
          return ParseResult.failed(wpr.parseError);
        }

        // Attempt parse sep
        if (this._sepParser) {
          parserContext.cutEncountered = false;
          bm = parserContext.input.getBookmark();
          const sepr = this._sepParser.parse(parserContext);
          if (sepr.successful) {
            mustParseElement = true;

            // Parse WS post separator
            parserContext.cutEncountered = false;
            wpr = this.parseWhitespace(parserContext);
            if (!wpr.successful) {
              return ParseResult.failed(wpr.parseError);
            }
          } else {
            if (parserContext.cutEncountered) {
              return ParseResult.failed(sepr.parseError);
            } else {
              parserContext.input.seekToBookmark(bm);
              break;
            }
          }
        }
      } while (true);

      if (
        output.length < this._min ||
        (this._max > 0 && output.length > this._max)
      ) {
        return ParseResult.failed(
          ParseError.parserRejected(
            this,
            parserContext,
            `Expected occurences in range {${this._min}, ${this._max}}; found ${output.length}`,
          ),
        );
      } else {
        return ParseResult.successful(output);
      }
    } finally {
      parserContext.cutEncountered = pce;
    }
  }
}
