import { Parser, ParserContext, ParseResult } from "../core";

export class NamedParser<T, C = unknown> implements Parser<T, C> {
  constructor(
    private _inner: Parser<T, C>,
    private _name: string,
  ) {}

  parse(ctx: ParserContext<C>): ParseResult<T> {
    ctx.pushName(this._name);
    try {
      return this._inner.parse(ctx);
    } finally {
      ctx.popName();
    }
  }
}
