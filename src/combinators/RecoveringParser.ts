import { Parser, ParserContext, ParseResult } from "../core";

// `overrides` (recoverWith): the inner parser runs strictly and the recovery replaces any of its own.
// Otherwise (orRecoverWith): the inner parser recovers as usual and the recovery is only a fallback.
export class RecoveringParser<T, R, C = unknown> implements Parser<T | R, C> {
  constructor(
    private _parser: Parser<T, C>,
    private _recovery: Parser<R, C>,
    private _overrides: boolean = true,
  ) {}

  parse(parserContext: ParserContext<C>): ParseResult<T | R> {
    if (!parserContext.recovering) {
      return this._parser.parse(parserContext);
    }

    const input = parserContext.input;
    const bm = input.getBookmark();

    const pre = parserContext.ranIntoEof;
    parserContext.ranIntoEof = false;
    const r = this._overrides
      ? parserContext.strictly(() => this._parser.parse(parserContext))
      : this._parser.parse(parserContext);
    const ranIntoEof = parserContext.ranIntoEof;
    parserContext.ranIntoEof = pre || ranIntoEof;

    if (r.successful || r.recovered) {
      return r;
    }

    // If collection completions, at the completion point
    // a failure means "to be completed":
    // leave it to completion rather than invent input.
    if (ranIntoEof && parserContext.completionEnabled) {
      return r;
    }

    // The recovery's own cuts must not leak; outer combinators see the inner parser's cut state.
    const cut = parserContext.cutEncountered;
    input.seekToBookmark(bm);
    parserContext.cutEncountered = false;
    const z = this._recovery.parse(parserContext);
    parserContext.cutEncountered = cut;

    if (z.successful) {
      return ParseResult.failed(r.parseError, {
        result: z.result,
        errors: [r.parseError],
      });
    }

    if (z.recovered) {
      return ParseResult.failed(r.parseError, {
        result: z.recovered.result,
        errors: [r.parseError, ...z.recovered.errors],
      });
    }

    return r;
  }
}
