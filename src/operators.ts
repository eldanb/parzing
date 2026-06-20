import { AstBuilder } from "./combinators/AstBuilder";
import { MapParser } from "./combinators/MapParser";
import { OptionalCombinator } from "./combinators/OptionalCombinator";
import { ParseObserver, ParseObserverCallbacks } from "./combinators/ParseObserver";
import { ParserWithIndices } from "./combinators/ParserWithIndices";
import { Parser, ParseResult, ParserWithInternalWhitespaceSupport } from "./core";

export namespace ParserOperators {
    export function map<S, T>(mapper: (s: S) => T) {
        return <C = unknown>(p: Parser<S, C>) => {
            return new MapParser(p, mapper);
        }
    }

    export function optional<T, C = unknown>() {
        return (p: Parser<T, C>) => {
            return new OptionalCombinator(p);
        }
    }

    export function build<Args extends [...any], Ctor extends new(...args: Args) => any>(ctor: Ctor) {
        return <C = unknown>(p: Parser<Args, C>) => {
            return new AstBuilder(p, ctor);
        }
    }

    export function omit() {
        return <C = unknown>(p: Parser<unknown, C>) => {
            return new MapParser(p, (a) => {});
        }
    }

    export function whitespace<T, C = unknown>(ws: Parser<unknown, C>) {
        return (p: ParserWithInternalWhitespaceSupport<T, C>) => {
            return p.whitespace(ws);
        }
    }

    export function withIndices<T, C = unknown>() {
        return (p: Parser<T, C>) => {
            return new ParserWithIndices(p);
        }
    }

    export function observe<C, T>(callbacks: ParseObserverCallbacks<T, C>) {
        return (p: Parser<T, C>) => {
            return new ParseObserver(p, callbacks);
        }
    }
}
