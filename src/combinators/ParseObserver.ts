import { Parser, ParserContext, ParseResult } from "../core";

export interface ParseObserverCallbacks<T, C> {
    enter?: (ctx: C) => void;
    leave?: (ctx: C, result: ParseResult<T>) => void;
}

export class ParseObserver<T, C = unknown> implements Parser<T, C> {
    constructor(
        private _parser: Parser<T, C>,
        private _callbacks: ParseObserverCallbacks<T, C>,
    ) {}

    parse(parserContext: ParserContext<C>): ParseResult<T> {
        this._callbacks.enter?.(parserContext.userContext);
        const result = this._parser.parse(parserContext);
        this._callbacks.leave?.(parserContext.userContext, result);
        return result;
    }
}
