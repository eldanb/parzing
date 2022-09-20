import { ParseError, Parser, ParserContext, ParseResult } from "../core";

export class AnyOfParser implements Parser<string> {
    _charBitmap: number[] | null;

    constructor(private _characters: string,                
                private _minLen: number | null = 1,
                private _maxLen: number | null = null) {

        const charBitmap = [];
        this._charBitmap = charBitmap;

        for(let i=0; i<_characters.length; i++) {
            const ccode = _characters.charCodeAt(i);
            if(ccode < 256) {
                charBitmap[ccode >> 3] = (charBitmap[ccode >> 3] || 0) | (1 << (ccode & 7));
            } else {
                this._charBitmap = null;
                break;
            }
        }

    }

    parse(parserContext: ParserContext): ParseResult<string> {
        let ret = [];
        let cont = true;
        const input = parserContext.input;

        while(cont && !input.eof()) {
            const str = input.peek(1);
            if(this._charBitmap) {
                const ccode = str.charCodeAt(0);
                cont = (this._charBitmap[ccode >> 3] & (1 << (ccode & 7))) != 0;
            } else {
                cont = this._characters.indexOf(str) >= 0;
            }
                    
            if(cont) {
                ret.push(str);
                input.read(1);
            }
        }
        
        if( (this._maxLen != null && ret.length > this._maxLen) ||
            (this._minLen != null && ret.length < this._minLen) ) {                
            return ParseResult.failed(ParseError.parserRejected(this, parserContext, `Expecting AnyOf ${this._characters}`));
        }

        return ParseResult.successful(ret.join(''));
    }

}