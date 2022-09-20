import { ParseError, Parser, ParserContext, ParseResult, ParserType } from "../core";


type ChooseResult<E> = E extends [infer Head, ...infer Tails] ? ParserType<Head> | ChooseResult<Tails> : never;

export class ChooseCombinator<E extends Parser<any>[]> implements Parser<ChooseResult<E>> {
    constructor(private _parsers: E) {        
    }

    parse(parserContext: ParserContext): ParseResult<ChooseResult<E>> {
        const input = parserContext.input;
        const bm = input.getBookmark();

        for(let i = 0; i < this._parsers.length; i++) {
            const combOpt = this._parsers[i].parse(parserContext);
            if(combOpt.successful || parserContext.cutEncountered) {
                return combOpt;
            } else {
                input.seekToBookmark(bm);
            }
        }

        return ParseResult.failed(ParseError.parserRejected(this, parserContext));
    }
}
