import { Parser, ParserContext, ParseResult } from "../core";


export class AstBuilder<Args extends [...any], Ctor extends new(...args: Args) => any> implements Parser<InstanceType<Ctor>> {
    constructor(private _parser: Parser<Args>, private _ctor: Ctor) {

    }

    parse(parserContext: ParserContext): ParseResult<InstanceType<Ctor>> {
        const s = this._parser.parse(parserContext);
        if(!s.successful) {
            return <any>s;
        }

        return ParseResult.successful(new this._ctor(...s.result));
    }
}