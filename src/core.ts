export interface ParserInputBookmark {}

export interface ParserInput {
  read(readLen: number): string;
  peek(peekLen: number): string;

  readRegex?(regex: RegExp): string | null;
  peekRegex?(regex: RegExp): string | null;

  getBookmark(): ParserInputBookmark;
  seekToBookmark(bm: ParserInputBookmark): void;

  eof(): boolean;

  tell(): number;
}

export class StringParserInput implements ParserInput {
  private _index: number = 0;

  constructor(private _text: String) {}

  read(readLen: number): string {
    if (this._index + readLen > this._text.length) {
      this._index = this._text.length;
      throw new ParseError(
        this,
        this.getBookmark(),
        null,
        `Attempt to read beyond EOF`,
      );
    }

    const ret = this._text.substr(this._index, readLen);
    this._index += readLen;

    return ret;
  }

  peek(readLen: number): string {
    return this._text.substr(this._index, readLen);
  }

  readRegex(regex: RegExp): string | null {
    const ret = this.peekRegex(regex);
    if (ret) {
      this._index += ret.length;
    }

    return ret;
  }

  peekRegex(regex: RegExp): string | null {
    let matchResult = regex.exec(this._text.substring(this._index));
    if (!matchResult) {
      return null;
    }

    if (matchResult.index != 0) {
      return null;
    }

    return matchResult[0];
  }

  getBookmark(): ParserInputBookmark {
    return this._index;
  }

  seekToBookmark(bm: ParserInputBookmark) {
    this._index = <number>bm;
  }

  eof(): boolean {
    return this._index >= this._text.length;
  }

  remainder(): string {
    return this._text.substr(this._index);
  }

  skip(howMuch: number) {
    this._index += howMuch;
  }

  tell(): number {
    return this._index;
  }
}

export class ParserContext<C = unknown> {
  constructor(
    private _input: ParserInput,
    private _whitespaceParser: Parser<unknown, any> | null = null,
    public readonly userContext: C = undefined as unknown as C,
  ) {}

  parseWhitespace() {
    if (this._whitespaceParser) {
      this._whitespaceParser.parse(this);
    }
  }

  get input(): ParserInput {
    return this._input;
  }

  public cutEncountered: boolean = false;
}

export type ParseResult<T> =
  | { successful: true; failed: false; result: T }
  | { successful: false; failed: true; parseError: ParseError };

export namespace ParseResult {
  export function successful<T>(r: T): ParseResult<T> {
    return { successful: true, failed: false, result: r };
  }

  export function voidSuccessful(): ParseResult<void> {
    return { successful: true, failed: false, result: void 0 };
  }

  export function failed<T>(r: ParseError): ParseResult<T> {
    return { successful: false, failed: true, parseError: r };
  }

  export function resultOrThrow<T>(p: ParseResult<T>): T {
    if (p.successful) {
      return p.result;
    } else {
      throw p.parseError;
    }
  }
}

export interface Parser<T, C = unknown> {
  parse: (parserContext: ParserContext<C>) => ParseResult<T>;
}

export function isParser(p: any): p is Parser<unknown> {
  return "parse" in p;
}

export class FailParser<C = unknown> implements Parser<unknown, C> {
  constructor(private _message: string) {}

  parse(parserContext: ParserContext<C>) {
    return ParseResult.failed(
      ParseError.parserRejected(this, parserContext, this._message),
    );
  }
}

export class PassParser<C = unknown> implements Parser<void, C> {
  parse(parserContext: ParserContext<C>) {
    return ParseResult.voidSuccessful();
  }
}

export class CutParser<C = unknown> implements Parser<void, C> {
  parse(parserContext: ParserContext<C>) {
    parserContext.cutEncountered = true;
    return ParseResult.voidSuccessful();
  }
}

export class RefParser<T, C = unknown> implements Parser<T, C> {
  constructor(private _parserProvider: () => Parser<T, C>) {}

  parse(parserContext: ParserContext<C>) {
    if (!this._parser) {
      this._parser = this._parserProvider();
    }

    return this._parser.parse(parserContext);
  }

  private _parser?: Parser<T, C>;
}

export type ParserType<pt> = pt extends Parser<infer T, any> ? T : never;

export class ParserWithInternalWhitespaceSupport<
  T,
  C = unknown,
> implements Parser<T, C> {
  parse(parserContext: ParserContext<C>): ParseResult<T> {
    throw new Error("Method not implemented");
  }

  whitespace(
    whitespaceParser: Parser<unknown, any> | null,
  ): ParserWithInternalWhitespaceSupport<T, C> {
    this._whitespace = whitespaceParser;
    return this;
  }

  protected parseWhitespace(parserContext: ParserContext<C>) {
    if (this._whitespace) {
      return this._whitespace.parse(parserContext);
    } else {
      return ParseResult.voidSuccessful();
    }
  }

  private _whitespace: Parser<unknown, any> | null = null;
}

export function parse<T, C = unknown>(
  parser: Parser<T, C>,
  input: ParserInput | string,
  allowPartial: boolean = false,
  userContext?: C,
): T {
  if (typeof input === "string") {
    input = new StringParserInput(input);
  }

  let context = new ParserContext<C>(input, null, userContext as C);
  const ret = parser.parse(context);

  if (!allowPartial && !input.eof()) {
    throw new ParseError(
      input,
      input.getBookmark(),
      null,
      `End of input expected`,
    );
  }

  return ParseResult.resultOrThrow(ret);
}

export class ParseError {
  public message: string;

  constructor(
    input: ParserInput,
    bookmark: ParserInputBookmark | null,
    parser: Parser<unknown, any> | null,
    contentMessage: string,
  ) {
    this.message = contentMessage;
    if (bookmark) {
      this.message = `${this.message} at ${bookmark} ('${input.peek(5)}')`;
    }
  }

  toString(): string {
    return `Error: ${this.message}`;
  }

  static parserRejected(
    parser: Parser<unknown, any>,
    context: ParserContext<any>,
    message?: string,
  ) {
    return new ParseError(
      context.input,
      context.input.getBookmark(),
      parser,
      message || `Parser rejected input`,
    );
  }
}
