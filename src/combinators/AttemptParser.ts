import { Parser, ParserContext, ParseResult } from "../core";


export class AttemptParser<T, C = unknown> implements Parser<T, C> {
    constructor(private _parser: Parser<T, C>) {
    }

    parse(parserContext: ParserContext<C>): ParseResult<T> {
        const s = this._parser.parse(parserContext);
        parserContext.cutEncountered = false;
        return s;
    }
}
