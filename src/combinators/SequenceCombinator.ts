import { Parser, ParserContext, ParseResult, ParserType, ParserWithInternalWhitespaceSupport } from "../core";

export type FilterVoid<T> = T extends [infer Head, ...infer Rest] ? (Head extends void ? [...FilterVoid<Rest>] : [Head, ...FilterVoid<Rest>]) : T;
export type SeqType<TS extends Parser<unknown, any>[]> = FilterVoid<{
    [i in keyof TS]: ParserType<TS[i]>
}>;


export class SequenceCombinator<TS extends Parser<unknown, C>[], C = unknown> extends ParserWithInternalWhitespaceSupport<SeqType<TS>, C> {
    constructor(private _parsers: TS) {
        super();
    }

    parse(parserContext: ParserContext<C>): ParseResult<SeqType<TS>> {
        const results: unknown[] = [];
        for(let i = 0; i < this._parsers.length; i++) {
            if(i) {
                const wsr = this.parseWhitespace(parserContext);
                if(!wsr.successful) {
                    return ParseResult.failed(wsr.parseError);
                }
            }

            const parser: Parser<unknown, C> = this._parsers[i];
            const psr = parser.parse(parserContext);
            if(psr.successful) {
                if(psr.result !== undefined) {
                    results.push(psr.result);
                }
            } else {
                return ParseResult.failed(psr.parseError);
            }
        }

        return ParseResult.successful(results as SeqType<TS>);
    }
}
