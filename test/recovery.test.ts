import assert from "assert";
import "mocha";
import { ParserBuilder } from "../src/builder";
import {
  parse,
  ParseError,
  Parser,
  ParserContext,
  ParseResult,
  StringParserInput,
} from "../src/core";
import { ParserOperators as O } from "../src/operators";

const P = new ParserBuilder();

// Consumes `text` and fails, carrying `value` as its recovery.
function recoversAs<T>(text: string, value: T): Parser<T> {
  return {
    parse(ctx: ParserContext<unknown>) {
      ctx.input.read(text.length);
      const err = ParseError.parserRejected(this, ctx, "stub");
      return ParseResult.failed(err, { result: value, errors: [err] });
    },
  };
}

describe("Recovery core", () => {
  describe("ParseError", () => {
    it("records the offset where it was raised", () => {
      try {
        parse(P.sequence(P.token("ab"), P.token("cd")), "abxx");
        assert.fail("expected a parse error");
      } catch (e) {
        assert.strictEqual((e as ParseError).offset, 2);
      }
    });
  });

  describe("ParserContext.ranIntoEof", () => {
    it("is set when a leaf runs out of input", () => {
      const ctx = new ParserContext(new StringParserInput("EN"));
      P.token("END").parse(ctx);
      assert.strictEqual(ctx.ranIntoEof, true);
    });

    it("is not set by an ordinary mismatch", () => {
      const ctx = new ParserContext(new StringParserInput("EXX"));
      P.token("END").parse(ctx);
      assert.strictEqual(ctx.ranIntoEof, false);
    });
  });

  describe("parse() with recover", () => {
    function parseRecovering<T>(p: Parser<T>, text: string, allowPartial = false) {
      return parse(p, text, allowPartial, undefined, undefined, true);
    }

    function thrownBy(fn: () => unknown): ParseError {
      try {
        fn();
      } catch (e) {
        return e as ParseError;
      }
      return assert.fail("expected a parse error");
    }

    it("returns the result on valid input", () => {
      assert.strictEqual(parseRecovering(P.token("ab"), "ab"), "ab");
    });

    it("throws the plain error when nothing recovers", () => {
      const e = thrownBy(() => parseRecovering(P.token("ab"), "xx"));
      assert.strictEqual(e.offset, 0);
      assert.strictEqual(e.recovered, undefined);
    });

    it("throws an error carrying the recovered result and its errors", () => {
      const e = thrownBy(() => parseRecovering(recoversAs("ab", 42), "ab"));
      assert.ok(e instanceof ParseError);
      assert.strictEqual(e.message.startsWith("stub"), true);
      assert.strictEqual(e.recovered!.result, 42);
      assert.strictEqual(e.recovered!.errors.length, 1);
      assert.doesNotThrow(() => JSON.stringify(e));
    });

    it("reports leftover input with the result recovered so far", () => {
      const e = thrownBy(() => parseRecovering(P.token("ab"), "abcd"));
      assert.strictEqual(e.offset, 2);
      assert.strictEqual(e.recovered!.result, "ab");
      assert.deepStrictEqual(
        e.recovered!.errors.map((x) => x.offset),
        [2],
      );
    });

    it("accepts leftover input when allowPartial is set", () => {
      assert.strictEqual(parseRecovering(P.token("ab"), "abcd", true), "ab");
    });

    it("ignores recoveries when not in recovery mode", () => {
      const e = thrownBy(() => parse(recoversAs("ab", 42), "ab"));
      assert.strictEqual(e.recovered, undefined);
    });
  });

  function recoveredOf<T>(p: Parser<T>, text: string): T {
    try {
      parse(p, text, false, undefined, undefined, true);
    } catch (e) {
      return (e as ParseError).recovered!.result as T;
    }
    return assert.fail("expected a parse error");
  }

  describe("result-transforming combinators", () => {
    it("map applies to a recovered value", () => {
      const p = P.parser(recoversAs("ab", 2))._(O.map((n: number) => n * 10));
      assert.strictEqual(recoveredOf(p, "ab"), 20);
    });

    it("build applies to a recovered value", () => {
      class Pair {
        constructor(public a: string, public b: string) {}
      }
      const p = P.parser(recoversAs<[string, string]>("ab", ["x", "y"]))._(O.build(Pair));
      assert.deepStrictEqual(recoveredOf(p, "ab"), new Pair("x", "y"));
    });

    it("withIndices measures up to the end of the recovery", () => {
      const ctx = new ParserContext(new StringParserInput("xabc"), null, undefined, undefined, true);
      ctx.input.read(1);
      const r = P.parser(recoversAs("abc", "R"))._(O.withIndices()).parse(ctx);
      assert.ok(r.failed && r.recovered);
      assert.deepStrictEqual(r.recovered.result, { result: "R", start: 1, length: 3 });
    });
  });
});
