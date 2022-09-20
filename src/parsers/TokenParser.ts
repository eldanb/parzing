import { ParseError, Parser, ParserContext, ParseResult } from "../core";

export class TokenParser implements Parser<string> {
    constructor(private _token: String) {

    }

    parse(parserContext: ParserContext): ParseResult<string> {
        try {
            const str = parserContext.input.read(this._token.length);
            if(str !== this._token) {
                return ParseResult.failed(ParseError.parserRejected(this, parserContext, 
                    `Expected token ${this._token}`));            
            }
    
            return ParseResult.successful(str);
        } catch(e) {
            return ParseResult.failed(e);
        }        
    }

}