import { AstBuilder } from "./combinators/AstBuilder";
import { MapParser } from "./combinators/MapParser";
import { OptionalCombinator } from "./combinators/OptionalCombinator";
import { ParserWithIndices } from "./combinators/ParserWithIndices";
import { Parser, ParserWithInternalWhitespaceSupport } from "./core";

export namespace ParserOperators {
    export function map<S, T>(mapper: (s: S) => T) {
        return (p: Parser<S>) => {
            return new MapParser(p, mapper);
        }
    }

    export function optional<T>() {
        return (p: Parser<T>) => {
            return new OptionalCombinator(p);
        }
    }

    export function build<Args extends [...any], Ctor extends new(...args: Args) => any>(ctor: Ctor) {
        return (p: Parser<Args>) => {
            return new AstBuilder(p, ctor);
        }
    }

    export function omit() {
        return (p: Parser<unknown>) => {
            return new MapParser(p, (a) => {});
        }
    }

    export function whitespace<T>(ws: Parser<unknown>) {
        return (p: ParserWithInternalWhitespaceSupport<T>) => {
            return p.whitespace(ws);
        }
    }

    export function withIndices<T>() {
        return (p: Parser<T>) => {
            return new ParserWithIndices(p);
        }
    }
}
