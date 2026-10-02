import { AstBuilder } from "./combinators/AstBuilder";
import { MapParser } from "./combinators/MapParser";
import { NamedParser } from "./combinators/NamedParser";
import { OptionalCombinator } from "./combinators/OptionalCombinator";
import {
  ParseObserver,
  ParseObserverCallbacks,
} from "./combinators/ParseObserver";
import { ParserWithIndices } from "./combinators/ParserWithIndices";
import { ParserContextType, ParserType } from "./core";
import { ExtensibleParser, ParserExtension } from "./extensions";

export const StandardOperators = {
  map<P extends ExtensibleParser, R>(this: P, mapper: (s: ParserType<P>) => R) {
    return this._((p) => new MapParser<P, R, ParserContextType<P>>(p, mapper));
  },

  optional<P extends ExtensibleParser>(this: P) {
    return this._(
      (p) => new OptionalCombinator<ParserType<P>, ParserContextType<P>>(p),
    );
  },

  build<
    P extends ExtensibleParser,
    Ctor extends new (...args: ParserType<P>) => any,
  >(this: P, ctor: Ctor) {
    return this._(
      (p) => new AstBuilder<ParserType<P>, Ctor, ParserContextType<P>>(p, ctor),
    );
  },

  omit<P extends ExtensibleParser>(this: P) {
    return this._(
      (p) => new MapParser<P, void, ParserContextType<P>>(p, () => {}),
    );
  },

  withIndices<P extends ExtensibleParser>(this: P) {
    return this._(
      (p) => new ParserWithIndices<ParserType<P>, ParserContextType<P>>(p),
    );
  },

  observe<P extends ExtensibleParser>(
    this: P,
    callbacks: ParseObserverCallbacks<ParserType<P>, ParserContextType<P>>,
  ) {
    return this._(
      (p) =>
        new ParseObserver<ParserType<P>, ParserContextType<P>>(p, callbacks),
    );
  },

  named<P extends ExtensibleParser>(this: P, name: string) {
    return this._(
      (p) => new NamedParser<ParserType<P>, ParserContextType<P>>(p, name),
    );
  },
} satisfies ParserExtension;
