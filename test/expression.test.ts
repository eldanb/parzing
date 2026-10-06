import assert from "assert";
import "mocha";
import { ParserBuilder } from "../src/builder";
import { parse, ParseError, Parser } from "../src/core";
import { ParserOperators as O } from "../src/operators";
import { WhitespaceParser } from "../src/parsers/WhitespaceParser";

// A small filter-expression language, written for recovery and completion:
//
//   fieldTerm := field OPERATOR literal
//   term      := "(" expr ")" | fieldTerm
//   andList   := many(term, "AND")
//   orList    := many(andList, "OR")
//   expr      := orList

class FieldTerm {
  constructor(public field: string, public op: string | Bad, public value: string | Bad) {}
}
class And {
  constructor(public terms: (FieldTerm | Or)[]) {}
}
class Or {
  constructor(public terms: And[]) {}
}
class Bad {
  constructor(public text: string) {}
}

const P = new ParserBuilder(new WhitespaceParser(false));

const kw = (s: string) => P.token(s)._(O.named(s));
const AND = kw("AND");
const OR = kw("OR");
const OPEN = kw("(");
const CLOSE = kw(")");

const field = P.regex(/(?!(AND|OR)\b)[A-Za-z_]\w*/)._(O.named("field"));
const operator = P.choice(
  P.token(">="), P.token("<="), P.token("!="), P.token("="), P.token("<"), P.token(">"),
)._(O.named("operator"));
const literal = P.choice(P.regex(/-?\d+(\.\d+)?/), P.regex(/"[^"]*"/))._(O.named("value"));

const missing = P.pass()._(O.map(() => new Bad("")));
const junk = (re: RegExp) => P.regex(re)._(O.map((s: string) => new Bad(s)));

// The cut after the field commits to a field term: a broken one is an error, not "not a term".
const fieldTerm = P.sequence(
  field,
  P.cut(),
  operator._(O.recoverWith(P.choice(junk(/[^\s\w()"]+/), missing))),
  literal._(O.recoverWith(P.choice(junk(/(?!(AND|OR)\b)[^\s()]+/), missing))),
)._(O.build(FieldTerm));

let expr: Parser<Or>;
const paren = P.sequence(
  OPEN._(O.omit()),
  P.cut(),
  P.ref(() => expr),
  CLOSE._(O.omit())._(O.recoverWith(P.pass())),
)._(O.map(([e]) => e));
const term = P.choice(paren, fieldTerm);
const andList = P.many(term, AND, 1, 0, P.choice(OR, CLOSE))._(O.map((ts) => new And(ts)));
const orList = P.many(andList, OR, 1, 0, CLOSE)._(O.map((ts) => new Or(ts)));
expr = orList;

function show(v: unknown): string {
  if (v instanceof Or) {
    return v.terms.length === 1 ? show(v.terms[0]) : `OR(${v.terms.map(show).join(", ")})`;
  }
  if (v instanceof And) {
    return v.terms.length === 1 ? show(v.terms[0]) : `AND(${v.terms.map(show).join(", ")})`;
  }
  if (v instanceof FieldTerm) {
    return `${v.field}${show(v.op)}${show(v.value)}`;
  }
  if (v instanceof Bad) {
    return `<bad:${v.text}>`;
  }
  return String(v);
}

function recover(text: string): { result: string; errors: [number, number][] } {
  try {
    return { result: show(parse(expr, text, false, undefined, undefined, true)), errors: [] };
  } catch (e) {
    const pe = e as ParseError;
    if (!pe.recovered) {
      throw pe;
    }
    return {
      result: show(pe.recovered.result),
      errors: pe.recovered.errors.map((x) => [x.offset, x.length]),
    };
  }
}

function completions(text: string): string[] {
  const names: string[] = [];
  try {
    parse(expr, text, false, undefined, (e) => names.push(e.nameStack[e.nameStack.length - 1]), true);
  } catch {}
  return names;
}

describe("Expression language", () => {
  describe("valid input", () => {
    it("parses in strict mode", () => {
      assert.strictEqual(show(parse(expr, 'age > 30 AND (name = "x" OR b < 2)')), 'AND(age>30, OR(name="x", b<2))');
    });

    it("parses identically in recovery mode", () => {
      assert.deepStrictEqual(recover('age > 30 AND (name = "x" OR b < 2)'), {
        result: 'AND(age>30, OR(name="x", b<2))',
        errors: [],
      });
    });

    it("fails in strict mode on broken input", () => {
      assert.throws(() => parse(expr, "age > 30 AND AND x = 1"));
    });
  });

  describe("recovery", () => {
    const cases: [string, string, [number, number][]][] = [
      ["age > 30 AND AND x = 1", "AND(age>30, x=1)", [[13, 0]]],
      ["age > 30 x = 1", "AND(age>30, x=1)", [[9, 0]]],
      ["age 30", "age<bad:>30", [[4, 0]]],
      ["age ~ 30", "age<bad:~>30", [[4, 0]]],
      ["age > AND x = 1", "AND(age><bad:>, x=1)", [[6, 0]]],
      ["age AND x = 1", "AND(age<bad:><bad:>, x=1)", [[4, 0], [4, 0]]],
      ['name = "abc AND x = 1', 'AND(name=<bad:"abc>, x=1)', [[7, 0]]],
      ["(age > 30", "age>30", [[9, 0]]],
      ["(age > 30 OR) AND x = 1", "AND(age>30, x=1)", [[12, 0]]],
      ["= 30 AND x = 1", "x=1", [[0, 5]]],
      ["AND x = 1", "x=1", [[0, 0]]],
      ["a = 1 ?? b =", "AND(a=1, b=<bad:>)", [[6, 3], [12, 0]]],
    ];

    for (const [text, result, errors] of cases) {
      it(`recovers ${JSON.stringify(text)}`, () => {
        assert.deepStrictEqual(recover(text), { result, errors });
      });
    }
  });

  describe("recovery limits", () => {
    it("treats a stray ) at the top level as the end of the expression", () => {
      // `)` is in the shared lists' `until`, so the lists end there; the rest is left over.
      assert.deepStrictEqual(recover("age > 30 ) AND x = 1"), { result: "age>30", errors: [[9, 0]] });
    });

    it("cannot recover input with no term at all", () => {
      assert.throws(
        () => parse(expr, "???", false, undefined, undefined, true),
        (e: ParseError) => e.recovered === undefined,
      );
    });

    it("recovers crudely from a doubled operator", () => {
      assert.deepStrictEqual(recover("age > > 30"), { result: "age><bad:>>", errors: [[6, 0], [8, 2]] });
    });

    it("silently misreads a field starting with a keyword", () => {
      // A grammar issue, not a recovery one: token("AND") matches the start of "ANDY".
      assert.deepStrictEqual(recover("a = 1 ANDY = 2"), { result: "AND(a=1, Y=2)", errors: [] });
    });
  });

  describe("completion", () => {
    const ops = Array(6).fill("operator");
    const cases: [string, string[]][] = [
      ["", ["(", "field"]],
      ["ag", ops],
      ["age ", ops],
      ["age >", ["operator", "value", "value"]],
      ["age !", ["operator"]],
      ["age > 30 ", ["AND", "OR"]],
      ["age > 30 A", ["AND"]],
      ["age > 30 AND ", ["(", "field"]],
      ["(age > 30 OR ", ["(", "field"]],
      ["(age > 30 ", ["AND", "OR", ")"]],
    ];

    for (const [text, expected] of cases) {
      it(`offers ${JSON.stringify(expected)} at ${JSON.stringify(text + "|")}`, () => {
        assert.deepStrictEqual(completions(text), expected);
      });
    }

    describe("past earlier errors", () => {
      it("completes after a broken term", () => {
        assert.deepStrictEqual(completions("x ~ 1 AND y"), ops);
      });

      it("completes after junk", () => {
        assert.deepStrictEqual(completions("x = 1 ?? AND y"), ops);
      });

      it("completes a broken term after junk", () => {
        assert.deepStrictEqual(completions("a = 1 ?? b ="), ["value", "value"]);
      });
    });
  });
});
