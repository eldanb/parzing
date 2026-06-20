import { Parser, ParserContext, ParseResult, ParserType } from "../core";

export class MapParser<V extends Parser<unknown, C>, T, C = unknown> implements Parser<T, C> {
    constructor(private _parser: V,
                private _fn: (i: ParserType<V>) => T) {
    }

    parse(parserContext: ParserContext<C>): ParseResult<T> {
        const s = this._parser.parse(parserContext);
        if(!s.successful) {
            return ParseResult.failed(s.parseError);
        }

        return ParseResult.successful(this._fn(s.result as any));
    }
}
