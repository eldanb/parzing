import {
  ParseError,
  Parser,
  ParserContext,
  ParserInputBookmark,
  ParseResult,
  ParserWithInternalWhitespaceSupport,
} from "../core";
import { RecoveryErrors } from "./RecoveryErrors";

type Step = "element" | "separator";

export class ManyCombinator<T, C = unknown> extends ParserWithInternalWhitespaceSupport<
  T[],
  C
> {
  constructor(
    private _parser: Parser<T, C>,
    private _sepParser?: Parser<unknown, C>,
    private _min: number = 0,
    private _max: number = 0,
    private _until?: Parser<unknown, C>,
  ) {
    super();
  }

  parse(parserContext: ParserContext<C>): ParseResult<T[]> {
    const input = parserContext.input;
    const output: T[] = [];
    const errors = new RecoveryErrors();

    const pce = parserContext.cutEncountered;
    let next: Step = "element";
    let afterSeparator = false;
    // Attempting the same thing at the same position twice means no progress; stop rather than loop.
    const lastAttemptPos = { element: -1, separator: -1 };

    try {
      while (true) {
        const parser = next === "element" ? this._parser : this._sepParser!;

        const start = input.getBookmark();
        const startPos = input.tell();
        if (lastAttemptPos[next] === startPos) {
          break;
        }
        lastAttemptPos[next] = startPos;

        const [r, ranIntoEof] = this.attempt(parserContext, parser);
        let value: unknown;
        if (r.successful) {
          value = r.result;
        } else {
          const mayRecover =
            parserContext.recovering &&
            !(ranIntoEof && parserContext.completionEnabled);
          const isError =
            (next === "element" && afterSeparator) ||
            parserContext.cutEncountered ||
            (mayRecover && !this.atEndOfList(parserContext, start));

          if (!isError) {
            input.seekToBookmark(start);
            break;
          }

          if (!mayRecover) {
            return ParseResult.failed(r.parseError);
          }

          if (r.recovered) {
            value = r.recovered.result;
            errors.add(r.parseError, r.recovered.errors);
          } else {
            input.seekToBookmark(start);
            const landing = this.skipJunk(parserContext, r.parseError, errors);
            if (landing === "end") {
              break;
            }
            next = landing;
            afterSeparator = false;
            continue;
          }
        }

        if (next === "element") {
          output.push(value as T);
          afterSeparator = false;
          next = this._sepParser ? "separator" : "element";
        } else {
          afterSeparator = true;
          next = "element";
        }

        parserContext.cutEncountered = false;
        const wpr = this.parseWhitespace(parserContext);
        if (!wpr.successful) {
          return ParseResult.failed(wpr.parseError);
        }
      }

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
      }

      return errors.result(output);
    } finally {
      parserContext.cutEncountered = pce;
    }
  }

  private attempt<R>(
    parserContext: ParserContext<C>,
    parser: Parser<R, C>,
  ): [ParseResult<R>, boolean] {
    parserContext.cutEncountered = false;
    const pre = parserContext.ranIntoEof;
    parserContext.ranIntoEof = false;
    const r = parser.parse(parserContext);
    const ranIntoEof = parserContext.ranIntoEof;
    parserContext.ranIntoEof = pre || ranIntoEof;
    return [r, ranIntoEof];
  }

  private atEndOfList(parserContext: ParserContext<C>, at: ParserInputBookmark): boolean {
    if (!this._until) {
      return true;
    }

    const input = parserContext.input;
    const current = input.getBookmark();
    input.seekToBookmark(at);
    const atEnd = input.eof() || this.lookahead(parserContext, this._until);
    input.seekToBookmark(current);
    return atEnd;
  }

  // Skips to the next element, separator or `until` and records the error. Without `until`
  // nothing says where the list ends, so it never skips past the current position.
  private skipJunk(
    parserContext: ParserContext<C>,
    zeroLengthError: ParseError,
    errors: RecoveryErrors,
  ): Step | "end" {
    const input = parserContext.input;
    const start = input.getBookmark();
    const startPos = input.tell();

    let landing: Step | "end";
    while (true) {
      if (input.eof()) {
        landing = "end";
        break;
      }
      if (this.lookahead(parserContext, this._parser)) {
        landing = "element";
        break;
      }
      if (this._sepParser && this.lookahead(parserContext, this._sepParser)) {
        landing = "separator";
        break;
      }
      if (!this._until || this.lookahead(parserContext, this._until)) {
        landing = "end";
        break;
      }
      input.read(1);
    }

    const skipped = input.tell() - startPos;
    if (skipped === 0) {
      errors.add(zeroLengthError);
    } else {
      const end = input.getBookmark();
      input.seekToBookmark(start);
      errors.add(
        new ParseError(
          input,
          start,
          this,
          "Unexpected input",
          parserContext.nameStack.slice(),
          skipped,
        ),
      );
      input.seekToBookmark(end);
    }

    return landing;
  }

  private lookahead(parserContext: ParserContext<C>, parser: Parser<unknown, C>): boolean {
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
}
