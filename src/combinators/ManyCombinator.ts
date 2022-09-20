import { ParseError, Parser, ParserContext, ParseResult, ParserInput, ParserWithInternalWhitespaceSupport, PassParser } from "../core";

export class ManyCombinator<T> 
    extends ParserWithInternalWhitespaceSupport<T[]> {
    constructor(private _parser: Parser<T>, 
                private _sepParser: Parser<unknown> = null,
                private _min: number = 0,
                private _max: number = 0) {        
        super()
    }

    parse(parserContext: ParserContext): ParseResult<T[]> {
        const output: T[] = [];

        const pce = parserContext.cutEncountered;
        let mustParseElement: boolean = false;

        try {
            do {
                // Parse element
                let bm = parserContext.input.getBookmark();
                parserContext.cutEncountered = false;
                const psr = this._parser.parse(parserContext);
                if(psr.successful) { 
                    output.push(psr.result);
                } else {
                    if(mustParseElement || parserContext.cutEncountered) {
                        return <any>psr;
                    } else {
                        parserContext.input.seekToBookmark(bm);
                        break;
                    }
                }

                mustParseElement = false;

                // Parse WS
                parserContext.cutEncountered = false;
                let wpr = this.parseWhitespace(parserContext);
                if(!wpr.successful) {
                    return <any>wpr;
                }

                // Attempt parse sep
                if(this._sepParser) {
                    parserContext.cutEncountered = false;
                    bm = parserContext.input.getBookmark();
                    const sepr = this._sepParser.parse(parserContext);
                    if(sepr.successful) {
                        mustParseElement = true;

                        // Parse WS post separator
                        parserContext.cutEncountered = false;
                        wpr = this.parseWhitespace(parserContext);
                        if(!wpr.successful) {
                            return <any>wpr;
                        }
                    } else {
                        if(parserContext.cutEncountered) {
                            return <any>sepr;
                        } else {
                            parserContext.input.seekToBookmark(bm);
                            break;
                        }
                    } 
                }
            } while(true);
                        
            if( (output.length < this._min) || 
                ((this._max > 0) && output.length > this._max) ) {
                    return ParseResult.failed(
                        ParseError.parserRejected(this, parserContext, 
                            `Expected occurences in range {${this._min}, ${this._max}}; found ${output.length}`));
            } else {
                return ParseResult.successful(output);
            }
        } finally {
            parserContext.cutEncountered = pce;
        }
    }
}
