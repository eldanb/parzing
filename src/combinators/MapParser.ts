import { Parser, ParserContext, ParseResult, ParserType } from "../core";

export class MapParser<V extends Parser<unknown>, T> implements Parser<T> {
    constructor(private _parser: V, 
                private _fn: (i: ParserType<V>) => T) {
    }

    parse(parserContext: ParserContext): ParseResult<T> {
        const s = this._parser.parse(parserContext);
        if(!s.successful) {
            return <any>s;
        }

        return ParseResult.successful(this._fn(s.result as any));
    }     
}
