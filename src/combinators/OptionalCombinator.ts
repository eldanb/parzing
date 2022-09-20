import { Parser, ParserContext, ParseResult } from "../core";

export class OptionalCombinator<T> implements Parser<T | null> {
    constructor(private _parser: Parser<T>) {                
    }

    parse(parserContext: ParserContext): ParseResult<T | null> {
        const input = parserContext.input;
        
        const bm = input.getBookmark();
        const pce = parserContext.cutEncountered;

        parserContext.cutEncountered = false;
        let ret = this._parser.parse(parserContext);        

        if(!ret.successful && !parserContext.cutEncountered) {
            input.seekToBookmark(bm);
            ret = ParseResult.successful(null);
        }

        parserContext.cutEncountered = pce;
        return ret;
    }
}
