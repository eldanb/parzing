import { AttemptParser } from "./combinators/AttemptParser";
import { ChooseCombinator } from "./combinators/ChooseCombinator";
import { ManyCombinator } from "./combinators/ManyCombinator";
import { MapParser } from "./combinators/MapParser";
import { NamedParser } from "./combinators/NamedParser";
import { OptionalCombinator } from "./combinators/OptionalCombinator";
import { SequenceCombinator } from "./combinators/SequenceCombinator";
import {
  CutParser,
  FailParser,
  Parser,
  ParserType,
  ParserWithInternalWhitespaceSupport,
  PassParser,
  RefParser,
} from "./core";
import { AnyOfParser } from "./parsers/AnyOfParser";
import { RegexParser } from "./parsers/RegexParser";
import { TokenParser } from "./parsers/TokenParser";

type WithPostfixSupport<T> = T & {
  _<R>(f: (target: WithPostfixSupport<T>) => R): WithPostfixSupport<R>;
};

export function addPostfixSupport<T>(who: T): WithPostfixSupport<T> {
  const ret = who as WithPostfixSupport<T>;
  ret._ = function (f: (target: WithPostfixSupport<T>) => any) {
    return addPostfixSupport(f(ret));
  };

  return ret;
}

export class ParserBuilder<C = unknown> {
  constructor(whitespaceParser: Parser<unknown, C> | null = null) {
    this._ws = whitespaceParser;
  }

  postProcessParser<T extends Parser<any, C>>(parser: T): WithPostfixSupport<T> {
    let p: Parser<ParserType<T>, C> = parser;
    if (p instanceof ParserWithInternalWhitespaceSupport && this._ws) {
      p = p.whitespace(this._ws);
    }

    return addPostfixSupport(<T>p);
  }

  parser<T extends Parser<any, C>>(p: T) {
    return this.postProcessParser(p);
  }

  token(tok: string) {
    return this.postProcessParser(new TokenParser<C>(tok));
  }

  anyOf(alts: string, minLen: number | null = 1, maxLen: number | null = null) {
    return this.postProcessParser(new AnyOfParser<C>(alts, minLen, maxLen));
  }

  regex(re: RegExp) {
    return this.postProcessParser(new RegexParser<C>(re));
  }

  fail(message: string) {
    return this.postProcessParser(new FailParser<C>(message));
  }

  pass() {
    return this.postProcessParser(new PassParser<C>());
  }

  cut() {
    return this.postProcessParser(new CutParser<C>());
  }

  ref<T>(f: () => Parser<T, C>) {
    return this.postProcessParser(new RefParser<T, C>(f));
  }

  attempt<T>(p: Parser<T, C>) {
    return this.postProcessParser(new AttemptParser<T, C>(p));
  }

  map<V extends Parser<unknown, C>, T>(
    parser: V,
    mapper: (i: ParserType<V>) => T,
  ) {
    return this.postProcessParser(new MapParser<V, T, C>(parser, mapper));
  }

  sequence<TS extends Parser<unknown, C>[]>(...s: TS) {
    return this.postProcessParser(new SequenceCombinator<TS, C>(s));
  }

  choice<T extends Parser<any, C>[]>(...parsers: T) {
    return new ChooseCombinator<T, C>(parsers);
  }

  many<T>(
    parser: Parser<T, C>,
    sep?: Parser<unknown, C>,
    min: number = 0,
    max: number = 0,
  ) {
    return this.postProcessParser(new ManyCombinator<T, C>(parser, sep, min, max));
  }

  optional<T>(parser: Parser<T, C>) {
    return this.postProcessParser(new OptionalCombinator<T, C>(parser));
  }

  named<T>(parser: Parser<T, C>, name: string) {
    return this.postProcessParser(new NamedParser<T, C>(parser, name));
  }

  private _ws: Parser<unknown, C> | null;
}
