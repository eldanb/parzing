import { Parser, ParserContext, ParseResult } from "../core";


export class AstBuilder<Args extends [...any], Ctor extends new(...args: Args) => any, C = unknown> implements Parser<InstanceType<Ctor>, C> {
    constructor(private _parser: Parser<Args, C>, private _ctor: Ctor) {
    }

    parse(parserContext: ParserContext<C>): ParseResult<InstanceType<Ctor>> {
        const s = this._parser.parse(parserContext);
        if(!s.successful) {
            return ParseResult.failed(s.parseError);
        }

        return ParseResult.successful(new this._ctor(...s.result));
    }
}
