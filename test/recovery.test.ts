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

  describe("recoverWith", () => {
    const constant = <T>(v: T) => P.pass()._(O.map(() => v));

    function recovering(text: string, onCompletion?: () => void) {
      return new ParserContext(new StringParserInput(text), null, undefined, onCompletion, true);
    }

    it("is transparent outside recovery mode", () => {
      const p = P.token("a")._(O.recoverWith(constant("R")));
      assert.strictEqual(parse(p, "a"), "a");
      assert.throws(() => parse(p, "x"), (e: ParseError) => e.recovered === undefined);
    });

    it("returns the inner result when it succeeds", () => {
      const p = P.token("a")._(O.recoverWith(constant("R")));
      assert.strictEqual(parse(p, "a", false, undefined, undefined, true), "a");
    });

    it("recovers with the recovery parser's result and the inner error", () => {
      const p = P.token("a")._(O.recoverWith(P.token("b")));
      const r = p.parse(recovering("b"));
      assert.ok(r.failed && r.recovered);
      assert.strictEqual(r.recovered.result, "b");
      assert.deepStrictEqual(r.recovered.errors, [r.parseError]);
    });

    it("runs the recovery parser from where the inner parser started", () => {
      const p = P.sequence(P.token("a"), P.token("b"))._(O.recoverWith(P.regex(/a./)));
      const ctx = recovering("ax");
      const r = p.parse(ctx);
      assert.ok(r.failed && r.recovered);
      assert.strictEqual(r.recovered.result, "ax");
      assert.strictEqual(ctx.input.tell(), 2);
    });

    it("overrides recoveries nested inside the inner parser", () => {
      const inner = P.token("a")._(O.recoverWith(constant("inner")));
      const p = P.parser(inner)._(O.recoverWith(constant("outer")));
      const r = p.parse(recovering("x"));
      assert.ok(r.failed && r.recovered);
      assert.strictEqual(r.recovered.result, "outer");
    });

    it("does not recover when the recovery parser fails", () => {
      const p = P.token("a")._(O.recoverWith(P.token("b")));
      const r = p.parse(recovering("x"));
      assert.ok(r.failed);
      assert.strictEqual(r.recovered, undefined);
    });

    it("uses the recovery parser's own recovery, collecting both errors", () => {
      const z = P.token("b")._(O.recoverWith(constant("deep")));
      const p = P.token("a")._(O.recoverWith(z));
      const r = p.parse(recovering("x"));
      assert.ok(r.failed && r.recovered);
      assert.strictEqual(r.recovered.result, "deep");
      assert.strictEqual(r.recovered.errors.length, 2);
      assert.strictEqual(r.recovered.errors[0], r.parseError);
    });

    it("keeps the inner parser's cut and hides the recovery parser's", () => {
      const cutThenFail = P.sequence(P.cut(), P.token("a"));
      const withInnerCut = P.parser(cutThenFail)._(O.recoverWith(constant("R")));
      const ctx1 = recovering("x");
      withInnerCut.parse(ctx1);
      assert.strictEqual(ctx1.cutEncountered, true);

      const withRecoveryCut = P.token("a")._(O.recoverWith(P.sequence(P.cut(), constant("R"))));
      const ctx2 = recovering("x");
      withRecoveryCut.parse(ctx2);
      assert.strictEqual(ctx2.cutEncountered, false);
    });

    describe("at end of input", () => {
      const end = P.token("END")._(O.recoverWith(constant("missing")));

      it("recovers when no completion callback is set", () => {
        const r = end.parse(recovering("EN"));
        assert.ok(r.failed && r.recovered);
        assert.strictEqual(r.recovered.result, "missing");
      });

      it("does not recover when completion is on", () => {
        const events: unknown[] = [];
        const r = end.parse(recovering("EN", () => events.push(1)));
        assert.ok(r.failed);
        assert.strictEqual(r.recovered, undefined);
        assert.strictEqual(events.length, 1);
      });

      it("still recovers failures before the end when completion is on", () => {
        const r = end.parse(recovering("EXX", () => {}));
        assert.ok(r.failed && r.recovered);
        assert.strictEqual(r.recovered.result, "missing");
      });

      it("propagates ranIntoEof to the caller", () => {
        const ctx = recovering("EN", () => {});
        end.parse(ctx);
        assert.strictEqual(ctx.ranIntoEof, true);
      });
    });

    it("types the result as the union of both parsers", () => {
      class Missing {}
      const p: Parser<string | Missing> = P.token("a")._(O.recoverWith(constant(new Missing())));
      assert.ok(p);
    });
  });
});
