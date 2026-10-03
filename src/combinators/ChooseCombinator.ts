import { ParseError, Parser, ParserContext, ParserInputBookmark, ParseResult, ParserType } from "../core";


type ChooseResult<E> = E extends [infer Head, ...infer Tails] ? ParserType<Head> | ChooseResult<Tails> : never;

export class ChooseCombinator<E extends Parser<any, C>[], C = unknown> implements Parser<ChooseResult<E>, C> {
    constructor(private _parsers: E) {
    }

    parse(parserContext: ParserContext<C>): ParseResult<ChooseResult<E>> {
        const input = parserContext.input;
        const bm = input.getBookmark();
        const pce = parserContext.cutEncountered;
        const expected: string[] = [];
        let best: { result: ParseResult<ChooseResult<E>>, end: ParserInputBookmark, endPos: number } | null = null;

        for(let i = 0; i < this._parsers.length; i++) {
            const parser: Parser<any, C> = this._parsers[i];
            parserContext.cutEncountered = false;
            const combOpt = parser.parse(parserContext);
            if(combOpt.successful) {
                parserContext.cutEncountered = pce;
                return combOpt;
            }

            // The alternative committed: its failure is final, and the cut stays visible to callers.
            if(parserContext.cutEncountered) {
                return combOpt;
            }

            const description = this.describe(combOpt.parseError, parserContext);
            if(!expected.includes(description)) {
                expected.push(description);
            }

            if(parserContext.recovering && combOpt.recovered) {
                const endPos = input.tell();
                if(!best || endPos > best.endPos) {
                    best = { result: combOpt, end: input.getBookmark(), endPos };
                }
            }

            input.seekToBookmark(bm);
        }

        parserContext.cutEncountered = pce;
        if(best) {
            input.seekToBookmark(best.end);
            return best.result;
        }

        return ParseResult.failed(ParseError.parserRejected(this, parserContext, `Expected one of: ${expected.join(", ")}`));
    }

    // Names an alternative by the first name it pushed (e.g. a named token or rule), else by what it expected.
    private describe(error: ParseError, parserContext: ParserContext<C>): string {
        const depth = parserContext.nameStack.length;
        if(error.nameStack.length > depth) {
            return error.nameStack[depth];
        }

        return error.reason.replace(/^Expected (one of: )?/, "");
    }
}
