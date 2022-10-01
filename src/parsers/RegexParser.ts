import { ParseError, Parser, ParserContext, ParseResult } from "../core";

export class RegexParser implements Parser<string> {
    _charBitmap: number[] | null;

    constructor(private _regex: RegExp) {
    }

    parse(parserContext: ParserContext): ParseResult<string> {
        if(!parserContext.input.readRegex) {
            throw ParseError.parserRejected(this, parserContext, "Input doesn't support regex parsing");
        }

        const reResult = parserContext.input.readRegex(this._regex);
        if(!reResult) {
            return ParseResult.failed(ParseError.parserRejected(this, parserContext, `Expected ${this._regex.source}`));
        }

        return ParseResult.successful(reResult);
    }
}