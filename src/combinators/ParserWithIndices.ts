import { Parser, ParserContext, ParseResult } from "../core";

type ResultWithIndices<T> = {
    result: T;
    start: number;
    length: number;
}

export class ParserWithIndices<T, C = unknown> implements Parser<ResultWithIndices<T>, C> {
    constructor(private _underlying: Parser<T, C>) {}

    parse(parserContext: ParserContext<C>): ParseResult<ResultWithIndices<T>> {
        const startOfs = parserContext.input.tell();
        const ret = this._underlying.parse(parserContext);
        const endOfs = parserContext.input.tell();

        if(!ret.successful) {
            return ParseResult.forwardFailure(ret, (r) => ({ result: r, start: startOfs, length: endOfs-startOfs }));
        }
        return ParseResult.successful({ result: ret.result, start: startOfs, length: endOfs-startOfs });
    }
}
