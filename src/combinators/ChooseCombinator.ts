import { ParseError, Parser, ParserContext, ParseResult, ParserType } from "../core";


type ChooseResult<E> = E extends [infer Head, ...infer Tails] ? ParserType<Head> | ChooseResult<Tails> : never;

export class ChooseCombinator<E extends Parser<any, C>[], C = unknown> implements Parser<ChooseResult<E>, C> {
    constructor(private _parsers: E) {
    }

    parse(parserContext: ParserContext<C>): ParseResult<ChooseResult<E>> {
        const input = parserContext.input;
        const bm = input.getBookmark();

        for(let i = 0; i < this._parsers.length; i++) {
            const parser: Parser<any, C> = this._parsers[i];
            const combOpt = parser.parse(parserContext);
            if(combOpt.successful || parserContext.cutEncountered) {
                return combOpt;
            } else {
                input.seekToBookmark(bm);
            }
        }

        return ParseResult.failed(ParseError.parserRejected(this, parserContext));
    }
}
