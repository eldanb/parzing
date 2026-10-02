import assert from "assert";
import "mocha";
import { ParserBuilder } from "../src/builder";
import { MapParser } from "../src/combinators/MapParser";
import { parse, Parser, ParserType } from "../src/core";
import { ExtensibleParser, ParserExtension } from "../src/extensions";
import { ParserOperators as O } from "../src/operators";
import { WhitespaceParser } from "../src/parsers/WhitespaceParser";
import { StandardOperators } from "../src/standardOperators";

const MyOps = {
  trimmed<P extends ExtensibleParser<string>>(this: P) {
    return this._((p) => new MapParser(p, (s) => s.trim()));
  },

  twice<P extends ExtensibleParser>(this: P) {
    return this._((p) => new MapParser(p, (v): [ParserType<P>, ParserType<P>] => [v, v]));
  },
};

const P = new ParserBuilder().withExtension(StandardOperators);
const PX = P.withExtension(MyOps);

class Pair {
  constructor(
    public left: string,
    public right: number,
  ) {}
}

describe("Parser extensions", () => {
  it("should expose standard operators as methods", () => {
    const num = P.anyOf("0123456789").map((s) => Number.parseInt(s));
    const r: number = parse(num, "42");
    assert.strictEqual(r, 42);
  });

  it("should keep extensions across operator chains", () => {
    const p = P.anyOf("0123456789")
      .map((s) => s.length)
      .map((n) => n * 2)
      .optional();
    const r: number | null = parse(p, "123");
    assert.strictEqual(r, 6);
    assert.strictEqual(parse(p, ""), null);
  });

  it("should support build and omit", () => {
    const pair = P.sequence(
      P.anyOf("abc"),
      P.token("=").omit(),
      P.anyOf("0123456789").map(Number),
    ).build(Pair);
    const r: Pair = parse(pair, "ab=12");
    assert.deepStrictEqual(r, new Pair("ab", 12));
  });

  it("should support withIndices and named", () => {
    const p = P.sequence(P.token("x").omit(), P.anyOf("abc").withIndices().named("abc"));
    assert.deepStrictEqual(parse(p, "xab"), [{ result: "ab", start: 1, length: 2 }]);
    assert.throws(() => parse(p, "xz"), (e: any) => e.nameStack[0] === "abc");
  });

  it("should pass typed context to observe", () => {
    const PC = new ParserBuilder<{ seen: string[] }>().withExtension(StandardOperators);
    const p = PC.token("a")
      .observe({ leave: (ctx, r) => r.successful && ctx.seen.push(r.result) })
      .map((s) => s.toUpperCase());
    const ctx = { seen: [] as string[] };
    assert.strictEqual(parse(p, "a", false, ctx), "A");
    assert.deepStrictEqual(ctx.seen, ["a"]);
  });

  it("should preserve the context type through standard operators (compile-time)", () => {
    const PC = new ParserBuilder<{ x: number }>().withExtension(StandardOperators);
    const p = PC.token("a").map((s) => s.length).omit().optional().named("n").withIndices();
    p.observe({ enter: (ctx) => ctx.x.toFixed() });
    // @ts-expect-error context type is carried, not widened to any
    const wrong: Parser<unknown, { y: string }> = PC.token("a").map((s) => s.length);
    assert.ok(p && wrong);
  });

  it("should chain multiple extensions", () => {
    const p = PX.regex(/ *[a-z]+ */).trimmed().twice().map(([a, b]) => a + b);
    const r: string = parse(p, "  ab ");
    assert.strictEqual(r, "abab");
  });

  it("should keep extensions through _ with classic operators", () => {
    const p = PX.anyOf("abc ")._(O.map((s) => s + " ")).trimmed();
    assert.strictEqual(parse(p, "ab "), "ab");
  });

  it("should keep extensions through whitespace()", () => {
    const p = P.sequence(P.token("a"), P.token("b"))
      .whitespace(new WhitespaceParser(true))
      .map(([a, b]) => a + b);
    assert.strictEqual(parse(p, "a  b"), "ab");
  });

  it("should extend choice results", () => {
    const p = P.choice(P.token("a"), P.token("b")).map((s) => s.toUpperCase());
    assert.strictEqual(parse(p, "b"), "B");
  });

  it("should apply the builder whitespace before extending", () => {
    const PW = new ParserBuilder(new WhitespaceParser(false)).withExtension(StandardOperators);
    const p = PW.sequence(PW.token("a"), PW.token("b")).map((s) => s.join(""));
    assert.strictEqual(parse(p, "a   b"), "ab");
  });

  it("should not add operators to parsers from a plain builder", () => {
    const plain = new ParserBuilder().token("a");
    assert.strictEqual("map" in plain, false);
    assert.strictEqual(parse(plain._(O.map((s) => s + "!")), "a"), "a!");
  });

  it("should not affect the builder it was derived from", () => {
    const base = P.token("a");
    assert.strictEqual("trimmed" in base, false);
    assert.strictEqual("trimmed" in PX.token("a"), true);
  });

  it("should reject operators that are not registered or do not fit (compile-time)", () => {
    const num = P.anyOf("0123456789").map(Number);
    const usable: Parser<number> = num;
    // @ts-expect-error trimmed is not registered on P
    () => num.trimmed();
    // @ts-expect-error trimmed requires a string parser
    () => PX.anyOf("1").map(Number).trimmed();
    assert.ok(usable);
  });

  it("should reject extensions whose members are not parser operators (compile-time)", () => {
    // @ts-expect-error not a parser operator
    () => P.withExtension({ double: (x: number) => x * 2 });
    // @ts-expect-error not a function
    () => P.withExtension({ version: 3 });
    // @ts-expect-error does not return a parser
    () => P.withExtension({ info<P extends ExtensibleParser>(this: P) { return { kind: "info" }; } });

    // @ts-expect-error caught where the extension is defined, too
    ({ info() { return 1; } }) satisfies ParserExtension;
    MyOps satisfies ParserExtension;

    // @ts-expect-error the builder's extension type parameter is constrained too
    type BadBuilder = ParserBuilder<unknown, { version: number }>;
    const goodBuilder: ParserBuilder<unknown, typeof StandardOperators & typeof MyOps> = PX;
    assert.ok(goodBuilder);
  });
});
