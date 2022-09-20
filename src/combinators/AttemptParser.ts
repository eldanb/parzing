import { Parser, ParserContext, ParseResult } from "../core";


export class AttemptParser<T> implements Parser<T> {
    constructor(private _parser: Parser<T>) {
    }

    parse(parserContext: ParserContext): ParseResult<T> {
        const s = this._parser.parse(parserContext);
        parserContext.cutEncountered = false;
        return s;
    }     
}
