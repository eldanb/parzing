import { Parser, ParserContext, ParseResult } from "../core";

type ResultWithIndices<T> = {
    result: T;
    start: number;
    length: number;
}

export class ParserWithIndices<T> implements Parser<ResultWithIndices<T>> {
    constructor(private _underlying: Parser<T>) {}

    parse(parserContext: ParserContext): ParseResult<ResultWithIndices<T>> {
        const startOfs = parserContext.input.tell();    
        const ret = this._underlying.parse(parserContext);
        const endOfs = parserContext.input.tell();

        if(!ret.successful) {
            return <any>ret;
        }
        return ParseResult.successful({ result: ret.result, start: startOfs, length: endOfs-startOfs });
    }    
}
