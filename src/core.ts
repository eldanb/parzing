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

export interface CompletionEvent<C = unknown> {
  readonly userContext: C;
  readonly nameStack: readonly string[];
}

export class ParserContext<C = unknown> {
  // Private fields typed with `any` for C keep ParserContext<C> covariant in C;
  // typed C here would make it invariant and break Parser<T, less-specific> subtype assignments.
  private _whitespaceParser: Parser<unknown, any> | null;
  private _onCompletion: ((e: CompletionEvent<any>) => void) | undefined;
  private _nameStack: string[] = [];
  private _recovering: boolean;

  constructor(
    private _input: ParserInput,
    whitespaceParser: Parser<unknown, any> | null = null,
    public readonly userContext: C = undefined as unknown as C,
    onCompletion?: (e: CompletionEvent<C>) => void,
    recovering: boolean = false,
  ) {
    this._whitespaceParser = whitespaceParser;
    this._onCompletion = onCompletion;
    this._recovering = recovering;
  }

  get recovering(): boolean {
    return this._recovering;
  }

  get completionEnabled(): boolean {
    return this._onCompletion !== undefined;
  }

  strictly<R>(fn: () => R): R {
    const prev = this._recovering;
    this._recovering = false;
    try {
      return fn();
    } finally {
      this._recovering = prev;
    }
  }

  parseWhitespace() {
    if (this._whitespaceParser) {
      this._whitespaceParser.parse(this);
    }
  }

  get input(): ParserInput {
    return this._input;
  }

  pushName(name: string): void {
    this._nameStack.push(name);
  }

  popName(): void {
    this._nameStack.pop();
  }

  get nameStack(): readonly string[] {
    return this._nameStack;
  }

  onIncompleteParseOption(): void {
    this.ranIntoEof = true;
    this._onCompletion?.({
      userContext: this.userContext,
      nameStack: this._nameStack.slice(),
    });
  }

  public cutEncountered: boolean = false;
  public ranIntoEof: boolean = false;
}

export interface Recovered<T> {
  result: T;
  errors: ParseError[];
}

export type ParseFailure<T> = {
  successful: false;
  failed: true;
  parseError: ParseError;
  recovered?: Recovered<T>;
};

export type ParseResult<T> =
  | { successful: true; failed: false; result: T }
  | ParseFailure<T>;

export namespace ParseResult {
  export function successful<T>(r: T): ParseResult<T> {
    return { successful: true, failed: false, result: r };
  }

  export function voidSuccessful(): ParseResult<void> {
    return { successful: true, failed: false, result: void 0 };
  }

  export function failed<T>(
    r: ParseError,
    recovered?: Recovered<T>,
  ): ParseResult<T> {
    return recovered
      ? { successful: false, failed: true, parseError: r, recovered }
      : { successful: false, failed: true, parseError: r };
  }

  export function forwardFailure<S, T>(
    f: ParseFailure<S>,
    fn: (s: S) => T,
  ): ParseResult<T> {
    return failed(
      f.parseError,
      f.recovered && {
        result: fn(f.recovered.result),
        errors: f.recovered.errors,
      },
    );
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
export type ParserContextType<pt> = pt extends Parser<any, infer C> ? C : never;

export class ParserWithInternalWhitespaceSupport<
  T,
  C = unknown,
> implements Parser<T, C> {
  parse(parserContext: ParserContext<C>): ParseResult<T> {
    throw new Error("Method not implemented");
  }

  whitespace(whitespaceParser: Parser<unknown, any> | null): this {
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
  onCompletion?: (e: CompletionEvent<C>) => void,
  recover: boolean = false,
): T {
  if (typeof input === "string") {
    input = new StringParserInput(input);
  }

  let context = new ParserContext<C>(
    input,
    null,
    userContext as C,
    onCompletion,
    recover,
  );
  const parseResult = parser.parse(context);
  if (!parseResult.successful && !(recover && parseResult.recovered)) {
    throw parseResult.parseError;
  }

  const errors = parseResult.successful ? [] : [...parseResult.recovered!.errors];
  const result = parseResult.successful
    ? parseResult.result
    : parseResult.recovered!.result;

  if (!allowPartial && !input.eof()) {
    errors.push(
      new ParseError(input, input.getBookmark(), null, `End of input expected`),
    );
  }

  if (errors.length === 0) {
    return result;
  }

  if (!recover) {
    throw errors[0];
  }

  const first = parseResult.successful ? errors[0] : parseResult.parseError;
  throw first.withRecovered({ result, errors });
}

export class ParseError {
  public message: string;
  public readonly nameStack: readonly string[];
  public readonly offset: number;
  public readonly recovered?: Recovered<unknown>;

  constructor(
    input: ParserInput,
    bookmark: ParserInputBookmark | null,
    parser: Parser<unknown, any> | null,
    contentMessage: string,
    nameStack: readonly string[] = [],
    public readonly length: number = 0,
  ) {
    this.offset = input.tell();
    this.nameStack = nameStack;
    this.message = contentMessage;
    if (nameStack.length > 0) {
      this.message = `[${nameStack.join(" > ")}] ${this.message}`;
    }
    if (bookmark) {
      this.message = `${this.message} at ${bookmark} ('${input.peek(5)}')`;
    }
  }

  withRecovered(recovered: Recovered<unknown>): ParseError {
    // A copy, so the thrown error is not itself inside recovered.errors (keeps it JSON-serialisable).
    return Object.assign(Object.create(ParseError.prototype), this, {
      recovered,
    });
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
      context.nameStack.slice(),
    );
  }
}
