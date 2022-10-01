import { AttemptParser } from "./combinators/AttemptParser";
import { ChooseCombinator } from "./combinators/ChooseCombinator";
import { ManyCombinator } from "./combinators/ManyCombinator";
import { MapParser } from "./combinators/MapParser";
import { OptionalCombinator } from "./combinators/OptionalCombinator";
import { SequenceCombinator } from "./combinators/SequenceCombinator";
import { CutParser, FailParser, isParser, Parser, ParserContext, ParserType, ParserWithInternalWhitespaceSupport, PassParser, RefParser } from "./core";
import { AnyOfParser } from "./parsers/AnyOfParser";
import { RegexParser } from "./parsers/RegexParser";
import { TokenParser } from "./parsers/TokenParser";

type WithPostfixSupport<T> = T & {
    _<R>(f: (target: WithPostfixSupport<T>) => R): WithPostfixSupport<R>;
}

export function addPostfixSupport<T>(who: T): WithPostfixSupport<T> {
    const ret = who as WithPostfixSupport<T>;
    ret._ = function(f: (target: WithPostfixSupport<T>) => any) {
        return addPostfixSupport(f(ret));
    }

    return ret;
}

export class ParserBuilder {
    constructor(whitespaceParser: Parser<unknown> | null = null) {
        this._ws = whitespaceParser;
    }

    postProcessParser<T extends Parser<any>>(parser: T): WithPostfixSupport<T> {
        let p: Parser<ParserType<T>> = parser;
        if(p instanceof ParserWithInternalWhitespaceSupport && this._ws) {
            p = p.whitespace(this._ws);
        } 

        return addPostfixSupport(<T>p);
    }

    parser<T extends Parser<any>>(p: T) {
        return this.postProcessParser(p);
    }

    token(tok: string) {
        return this.postProcessParser(new TokenParser(tok));
    }

    anyOf(alts: string,
          minLen: number | null = 1,
          maxLen: number | null = null) {        
        return this.postProcessParser(new AnyOfParser(alts, minLen, maxLen));
    }

    regex(re: RegExp) {        
      return this.postProcessParser(new RegexParser(re));
    }

    fail(message: string = null) {
        return this.postProcessParser(new FailParser(message));
    }
    
    pass() {
        return this.postProcessParser(new PassParser());
    }

    cut() {
        return this.postProcessParser(new CutParser());
    }

    ref<T>(f: () => Parser<T>) {
        return this.postProcessParser(new RefParser(f));
    }

    attempt<T>(p: Parser<T>) {
        return this.postProcessParser(new AttemptParser(p));
    }

    map<V extends Parser<unknown>, T>(parser: V, 
            mapper: (i: ParserType<V>) => T) {
        return this.postProcessParser(new MapParser(parser, mapper));
    }
    
    sequence<TS extends Parser<unknown>[]>(...s: TS) {
        return this.postProcessParser(new SequenceCombinator<TS>(s));
    }    

    choice<T extends Parser<any>[]>(...parsers: T) {
        return new ChooseCombinator<T>(parsers);
    }

    many<T>(parser: Parser<T>, 
            sep: Parser<unknown> | null = null,
            min: number = 0,
            max: number = 0) {
        return this.postProcessParser(new ManyCombinator<T>(parser, sep, min, max));
    }

    optional<T>(parser: Parser<T>) {
        return this.postProcessParser(new OptionalCombinator<T>(parser));
    }


    private _ws: Parser<unknown> | null;
}
