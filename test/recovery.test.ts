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
import { WhitespaceParser } from "../src/parsers/WhitespaceParser";

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

  describe("combinators in recovery mode", () => {
    const W = new ParserBuilder(new WhitespaceParser(false));
    const constant = <T>(v: T) => P.pass()._(O.map(() => v));

    function run<T>(p: Parser<T>, text: string, onCompletion?: () => void) {
      const ctx = new ParserContext(new StringParserInput(text), null, undefined, onCompletion, true);
      return { r: p.parse(ctx), ctx };
    }

    describe("sequence", () => {
      it("keeps an element's recovery and continues after it", () => {
        const p = P.sequence(P.token("a"), P.token("b")._(O.recoverWith(constant("B"))), P.token("c"));
        const { r } = run(p, "ac");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, ["a", "B", "c"]);
        assert.strictEqual(r.recovered.errors.length, 1);
        assert.strictEqual(r.parseError, r.recovered.errors[0]);
      });

      it("leaves omitted recovered values out of the tuple", () => {
        const p = P.sequence(P.token("a"), P.token("b")._(O.omit())._(O.recoverWith(P.pass())), P.token("c"));
        const { r } = run(p, "ac");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, ["a", "c"]);
      });

      it("has no recovery when a failed element has none", () => {
        const p = P.sequence(P.token("a"), P.token("b")._(O.recoverWith(constant("B"))), P.token("c"));
        const { r } = run(p, "ax");
        assert.ok(r.failed);
        assert.strictEqual(r.recovered, undefined);
      });
    });

    describe("choice", () => {
      const alt1 = P.sequence(P.token("a"), P.token("b")._(O.recoverWith(constant("x"))));
      const alt2 = P.sequence(P.token("a"), P.token("c"), P.token("d")._(O.recoverWith(constant("y"))));

      it("returns the recovery that got furthest when no alternative succeeds", () => {
        const { r, ctx } = run(P.choice(alt1, alt2), "ac?");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, ["a", "c", "y"]);
        assert.strictEqual(ctx.input.tell(), 2);
      });

      it("prefers the first of equally far recoveries", () => {
        const { r } = run(P.choice(alt1, P.sequence(P.token("a"), P.token("e")._(O.recoverWith(constant("z"))))), "a?");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, ["a", "x"]);
      });

      it("prefers a successful alternative over any recovery", () => {
        const { r } = run(P.choice(alt1, P.token("aq")), "aq");
        assert.ok(r.successful);
        assert.strictEqual(r.result, "aq");
      });
    });

    describe("optional", () => {
      it("discards a recovery when there was no cut", () => {
        const { r } = run(P.optional(P.token("a")._(O.recoverWith(constant("R")))), "b");
        assert.ok(r.successful);
        assert.strictEqual(r.result, null);
      });

      it("passes a recovery on after a cut", () => {
        const p = P.optional(P.sequence(P.cut(), P.token("a")._(O.recoverWith(constant("R")))));
        const { r } = run(p, "b");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, ["R"]);
      });
    });

    describe("many", () => {
      it("leaves out a missing element after a separator", () => {
        const { r } = run(P.many(P.token("x"), P.token(",")), "x,,x");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, ["x", "x"]);
        assert.deepStrictEqual(r.recovered.errors.map((e) => e.offset), [2]);
      });

      it("leaves out a missing element after a trailing separator", () => {
        const { r } = run(P.many(P.token("x"), P.token(",")), "x,");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, ["x"]);
      });

      it("keeps a committed element's recovery and continues", () => {
        const kv = W.sequence(W.token("k"), W.cut(), W.token("v")._(O.recoverWith(constant("?"))));
        const { r } = run(W.many(kv), "kv k kv");
        assert.ok(r.failed && r.recovered);
        assert.deepStrictEqual(r.recovered.result, [["k", "v"], ["k", "?"], ["k", "v"]]);
      });

      describe("with repeated separators", () => {
        const term = W.token("t");
        const and = W.token("AND");

        it("keeps a zero-width recovery for each missing element", () => {
          const { r } = run(W.many(term._(O.recoverWith(constant("?"))), and), "t AND AND AND t");
          assert.ok(r.failed && r.recovered);
          assert.deepStrictEqual(r.recovered.result, ["t", "?", "?", "t"]);
          assert.deepStrictEqual(r.recovered.errors.map((e) => e.offset), [6, 10]);
        });

        it("leaves out missing elements that have no recovery", () => {
          const { r } = run(W.many(term, and), "t AND AND AND t");
          assert.ok(r.failed && r.recovered);
          assert.deepStrictEqual(r.recovered.result, ["t", "t"]);
          assert.deepStrictEqual(r.recovered.errors.map((e) => e.offset), [6, 10]);
        });
      });

      describe("with until", () => {
        const list = W.many(W.token("x"), W.token(","), 0, 0, W.token(";"));
        const stmt = W.sequence(list, W.token(";"));

        it("stops normally where until matches", () => {
          const { r } = run(stmt, "x, x;");
          assert.ok(r.successful);
          assert.deepStrictEqual(r.result, [["x", "x"], ";"]);
        });

        it("skips junk between elements", () => {
          const { r } = run(stmt, "x, ?? x;");
          assert.ok(r.failed && r.recovered);
          assert.deepStrictEqual(r.recovered.result, [["x", "x"], ";"]);
          assert.strictEqual(r.recovered.errors.length, 1);
          const [e] = r.recovered.errors;
          assert.strictEqual(e.offset, 3);
          assert.strictEqual(e.length, 3);
        });

        it("reports a missing separator and continues", () => {
          const { r } = run(stmt, "x x;");
          assert.ok(r.failed && r.recovered);
          assert.deepStrictEqual(r.recovered.result, [["x", "x"], ";"]);
          assert.deepStrictEqual(r.recovered.errors.map((e) => e.offset), [2]);
        });

        it("skips junk at the end of the list", () => {
          const { r } = run(stmt, "x ??;");
          assert.ok(r.failed && r.recovered);
          assert.deepStrictEqual(r.recovered.result, [["x"], ";"]);
        });

        it("keeps an uncommitted element's recovery when until does not match", () => {
          const el = W.sequence(W.token("k"), W.token("v")._(O.recoverWith(constant("?"))));
          const { r } = run(W.sequence(W.many(el, undefined, 0, 0, W.token(";")), W.token(";")), "kv k kv;");
          assert.ok(r.failed && r.recovered);
          assert.deepStrictEqual(r.recovered.result, [[["k", "v"], ["k", "?"], ["k", "v"]], ";"]);
        });

        it("is ignored in strict mode", () => {
          assert.throws(() => parse(stmt, "x, ?? x;"));
        });
      });

      describe("when completion is on", () => {
        const list = W.many(W.token("x"), W.token("AND"), 0, 0, W.token(";"));

        it("does not skip junk when the failed attempt ran into EOF", () => {
          const events: unknown[] = [];
          const { r } = run(list, "x A", () => events.push(1));
          assert.ok(r.successful);
          assert.deepStrictEqual(r.result, ["x"]);
          assert.strictEqual(events.length, 1);
        });

        it("skips the same junk when completion is off", () => {
          const { r } = run(list, "x A");
          assert.ok(r.failed && r.recovered);
          assert.deepStrictEqual(r.recovered.result, ["x"]);
        });

        it("does not leave out a missing element at EOF", () => {
          const { r } = run(W.many(W.token("ab"), W.token(",")), "ab, a", () => {});
          assert.ok(r.failed);
          assert.strictEqual(r.recovered, undefined);
        });
      });

      it("stops when an iteration consumes nothing", () => {
        assert.deepStrictEqual(parse(P.many(P.optional(P.token("x"))), "y", true), [null]);
      });
    });
  });

  describe("skipUntil", () => {
    it("skips up to the terminator without consuming it", () => {
      const ctx = new ParserContext(new StringParserInput("ab;c"));
      const r = P.skipUntil(P.token(";")).parse(ctx);
      assert.ok(r.successful);
      assert.strictEqual(r.result, "ab");
      assert.strictEqual(ctx.input.tell(), 2);
    });

    it("succeeds with nothing when already at the terminator", () => {
      assert.strictEqual(parse(P.sequence(P.skipUntil(P.token(";")), P.token(";")), ";")[0], "");
    });

    it("skips to the end when the terminator never appears", () => {
      assert.strictEqual(parse(P.skipUntil(P.token(";")), "abc"), "abc");
    });

    it("never tries the terminator at the end of input", () => {
      const triedAt: number[] = [];
      const spy: Parser<void> = {
        parse(ctx: ParserContext<unknown>) {
          triedAt.push(ctx.input.tell());
          return ParseResult.failed(ParseError.parserRejected(this, ctx));
        },
      };
      parse(P.skipUntil(spy), "ab");
      assert.deepStrictEqual(triedAt, [0, 1]);
    });

    it("does not fire completion events while looking for the terminator", () => {
      const events: unknown[] = [];
      parse(P.skipUntil(P.token("END")), "xEN", false, undefined, () => events.push(1));
      assert.strictEqual(events.length, 0);
    });

    it("stops where the terminator commits, even if it then fails", () => {
      const committed = P.sequence(P.token("k"), P.cut(), P.token("v"));
      assert.strictEqual(parse(P.sequence(P.skipUntil(committed), P.token("kx")), "ab kx")[0], "ab ");
    });

    it("leaves cut and ranIntoEof untouched", () => {
      const ctx = new ParserContext(new StringParserInput("ab"));
      P.skipUntil(P.sequence(P.cut(), P.token("abc"))).parse(ctx);
      assert.strictEqual(ctx.cutEncountered, false);
      assert.strictEqual(ctx.ranIntoEof, false);
    });
  });

  describe("ref loop guard", () => {
    // factor := "("? expr ")"?   with both parentheses recovered as zero-width when missing
    let expr: Parser<unknown>;
    const factor = P.sequence(
      P.token("(")._(O.omit())._(O.recoverWith(P.pass())),
      P.ref(() => expr),
      P.token(")")._(O.omit())._(O.recoverWith(P.pass())),
    );
    expr = P.choice(P.token("x"), factor);

    it("terminates zero-width recursion in recovery mode", () => {
      assert.throws(
        () => parse(expr, "@", false, undefined, undefined, true),
        (e: ParseError) => e.recovered === undefined,
      );
    });

    it("still recovers around legitimate recursion", () => {
      assert.throws(
        () => parse(expr, "((x)", false, undefined, undefined, true),
        (e: ParseError) => JSON.stringify(e.recovered!.result) === JSON.stringify([["x"]]),
      );
    });

    it("does not affect strict parsing", () => {
      assert.deepStrictEqual(parse(expr, "((x))"), [["x"]]);
    });
  });
});
