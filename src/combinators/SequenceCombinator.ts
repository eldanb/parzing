import { ParseError, Parser, ParserContext, ParseResult, ParserType, ParserWithInternalWhitespaceSupport } from "../core";

export type FilterVoid<T> = T extends [infer Head, ...infer Rest] ? (Head extends void ? [...FilterVoid<Rest>] : [Head, ...FilterVoid<Rest>]) : T;
export type SeqType<TS extends Parser<unknown>[]> = FilterVoid<{
    [i in keyof TS]: ParserType<TS[i]>
}>;


export class SequenceCombinator<TS extends Parser<unknown>[]> extends ParserWithInternalWhitespaceSupport<SeqType<TS>> {
    constructor(private _parsers: TS) {
        super();
    }

    parse(parserContext: ParserContext): ParseResult<SeqType<TS>> {
        const results = [];
        for(let i = 0; i < this._parsers.length; i++) {
            if(i) {
                const wsr = this.parseWhitespace(parserContext);
                if(!wsr.successful) {
                    return <any>wsr;
                }
            }

            const psr = this._parsers[i].parse(parserContext);
            if(psr.successful) {
                if(psr.result !== undefined) {
                    results.push(psr.result);
                }
            } else {
                return <any>psr;
            }
        }
        
        return ParseResult.successful(results as SeqType<TS>);
    }
}
