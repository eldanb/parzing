import assert from "assert";
import "mocha";
import { ParserBuilder } from "../src/builder";
import { parse } from "../src/core";
import { ParserOperators } from "../src/operators";
import { WhitespaceParser } from "../src/parsers/WhitespaceParser";

const P = new ParserBuilder();

describe("Sequence Combinator", () => {
  it("should return sequence of parsers if found", () => {
    const tokParser = P.sequence(P.token("token1"), P.token("token2"));
    const parseResult = parse(tokParser, "token1token2");
    assert.deepEqual(parseResult, ["token1", "token2"]);
  });

  it("should return sequence of parsers with whitespace if found", () => {
    const tokParser = P.sequence(
      P.token("token1"),
      P.token("token2"),
    ).whitespace(new WhitespaceParser(true));
    const parseResult = parse(tokParser, "token1   token2");
    assert.deepEqual(parseResult, ["token1", "token2"]);
  });

  it("should return sequence of parsers with optional whitespace if found", () => {
    const tokParser = P.sequence(
      P.token("token1"),
      P.token("token2"),
    ).whitespace(new WhitespaceParser(false));
    const parseResult = parse(tokParser, "token1   token2");
    assert.deepEqual(parseResult, ["token1", "token2"]);
  });

  it("should accept sequence of parsers without optional whitespace", () => {
    const tokParser = P.sequence(
      P.token("token1"),
      P.token("token2"),
    ).whitespace(new WhitespaceParser(false));
    const parseResult = parse(tokParser, "token1token2");
    assert.deepEqual(parseResult, ["token1", "token2"]);
  });

  it("should fail if mandatory whitespace not found", () => {
    assert.throws(() => {
      const tokParser = P.sequence(
        P.token("token1"),
        P.token("token2"),
      ).whitespace(new WhitespaceParser(true));
      parse(tokParser, "token1token2");
    });
  });

  it("should not allow whitespace by default", () => {
    assert.throws(() => {
      const tokParser = P.sequence(P.token("token1"), P.token("token2"));
      parse(tokParser, "token1 token2");
    });
  });

  it("should throw if at eof", () => {
    assert.throws(() => {
      const tokParser = P.sequence(P.token("token1"), P.token("token2"));
      parse(tokParser, "token1");
    });
  });

  it("should throw if token doesnt match", () => {
    assert.throws(() => {
      const tokParser = P.sequence(P.token("token1"), P.token("token2"));
      parse(tokParser, "token1token3");
    });
  });
});

describe("Choice combinator", () => {
  it("should match first option if valid", () => {
    const choiceParser = P.choice(
      P.token("token1"),
      P.token("token2"),
      P.token("token3"),
    );

    assert.equal(parse(choiceParser, "token1"), "token1");
    assert.equal(parse(choiceParser, "token2"), "token2");
    assert.equal(parse(choiceParser, "token3"), "token3");
  });

  it("should support rollback", () => {
    const choiceParser = P.choice<any>(
      P.token("token1"),
      P.sequence(P.token("token2"), P.token("token22")),
      P.sequence(P.token("token2"), P.token("token23")),
    );

    assert.deepEqual(parse(choiceParser, "token2token23"), [
      "token2",
      "token23",
    ]);
  });

  it("Should honor cut", () => {
    assert.throws(() => {
      const choiceParser = P.choice<any>(
        P.token("token1"),
        P.sequence(P.token("token2"), P.cut(), P.token("token22")),
        P.sequence(P.token("token2"), P.token("token23")),
      );

      parse(choiceParser, "token2token23");
    });
  });
});

describe("Many combinator", () => {
  it("should match zero elements if allowed", () => {
    const choiceParser = P.many(
      P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
    );

    assert.deepEqual(parse(choiceParser, ""), []);
  });

  it("should match multiple elements", () => {
    const choiceParser = P.many(
      P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
    );

    assert.deepEqual(parse(choiceParser, "token1token2token3token2"), [
      "token1",
      "token2",
      "token3",
      "token2",
    ]);
  });

  it("should match multiple elements with separator and whitespace", () => {
    const choiceParser = P.many(
      P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
      P.token(","),
    ).whitespace(new WhitespaceParser(false));

    assert.deepEqual(parse(choiceParser, "token1 , token2, token3, token2"), [
      "token1",
      "token2",
      "token3",
      "token2",
    ]);
  });

  it("should fail match if separator missing", () => {
    assert.throws(() => {
      const choiceParser = P.many(
        P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
        P.token(","),
      );

      parse(choiceParser, "token1,token2token3,token2");
    });
  });

  it("should fail match if bad seq element", () => {
    assert.throws(() => {
      const choiceParser = P.many(
        P.choice(P.token("token1"), P.token("token3")),
      );

      parse(choiceParser, "token1token2token3token2");
    });
  });

  it("should fail match if terminated by separator", () => {
    assert.throws(() => {
      const choiceParser = P.many(
        P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
        P.token(","),
      );

      parse(choiceParser, "token1,token2,token3,token2,");
    });
  });

  it("should fail match if starts with separator", () => {
    assert.throws(() => {
      const choiceParser = P.many(
        P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
        P.token(","),
      );

      parse(choiceParser, ",token1,token2,token3,token2,");
    });
  });

  it("should fail match if includes empty separator", () => {
    assert.throws(() => {
      const choiceParser = P.many(
        P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
        P.token(","),
      );

      parse(choiceParser, "token1,,token2,token3,token2");
    });
  });

  it("should fail match if too few occurences", () => {
    assert.throws(() => {
      const choiceParser = P.many(
        P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
        undefined,
        3,
      );

      parse(choiceParser, "token1token2");
    });
  });

  it("Should honor cut in separator", () => {
    assert.throws(() => {
      const choiceParser = P.sequence(
        P.many(
          P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
          P.sequence(P.token("+"), P.cut(), P.token("+")),
        ),
        P.token("+"),
        P.token("token7"),
      );

      parse(choiceParser, "token2++token2+token7");
    });
  });

  it("Should rollback failed separator", () => {
    const choiceParser = P.sequence(
      P.many(
        P.choice(P.token("token1"), P.token("token2"), P.token("token3")),
        P.sequence(P.token("+"), P.token("+")),
      ),
      P.token("+"),
      P.token("token7"),
    );

    parse(choiceParser, "token2++token2+token7");
  });

  it("Should honor cut in item", () => {
    assert.throws(() => {
      const choiceParser = P.sequence(
        P.many(
          P.choice(
            P.token("token1"),
            P.token("token2"),
            P.token("token3"),
            P.map(
              P.sequence(P.token("m"), P.cut(), P.token("ust")),
              (r) => r[0] + r[1],
            ),
          ),
        ),
        P.token("make"),
      );

      parse(choiceParser, "token2musttoken1make");
    });
  });

  it("Should rollback failed item", () => {
    const choiceParser = P.sequence(
      P.many(
        P.choice(
          P.token("token1"),
          P.token("token2"),
          P.token("token3"),
          P.map(P.sequence(P.token("m"), P.token("ust")), (r) => r[0] + r[1]),
        ),
      ),
      P.token("make"),
    );

    assert.deepEqual(parse(choiceParser, "token2musttoken1make"), [
      ["token2", "must", "token1"],
      "make",
    ]);
  });
});

describe("Optional combinator", () => {
  it("should match if exists", () => {
    const choiceParser = P.sequence(
      P.token("token1"),
      P.optional(P.token("token2")),
      P.token("token3"),
    );

    assert.deepEqual(parse(choiceParser, "token1token2token3"), [
      "token1",
      "token2",
      "token3",
    ]);
  });

  it("should return null if does not exit, and rollback", () => {
    const choiceParser = P.sequence(
      P.token("token1"),
      P.optional(P.token("token2")),
      P.token("token3"),
    );

    assert.deepEqual(parse(choiceParser, "token1token3"), [
      "token1",
      null,
      "token3",
    ]);
  });

  it("should honor cut", () => {
    assert.throws(() => {
      const choiceParser = P.sequence(
        P.token("token1"),
        P.optional(P.sequence(P.token("tok"), P.cut(), P.token("en2"))),
        P.token("token3"),
      );

      parse(choiceParser, "token1token3");
    });
  });
});

interface TestContext {
  events: string[];
}

describe("NamedParser / named operator / completion", () => {
  it("should push name onto error's nameStack", () => {
    const p = P.named(P.token("hello"), "greeting");
    try {
      parse(p, "world");
      assert.fail("expected error");
    } catch (e: any) {
      assert.deepEqual(e.nameStack, ["greeting"]);
    }
  });

  it("should nest name stacks in error messages", () => {
    const p = P.named(P.named(P.token("hi"), "inner"), "outer");
    try {
      parse(p, "bye");
      assert.fail("expected error");
    } catch (e: any) {
      assert.deepEqual(e.nameStack, ["outer", "inner"]);
    }
  });

  it("should pop name after success so subsequent errors don't carry it", () => {
    const p = P.sequence(P.named(P.token("a"), "first"), P.token("b"));
    try {
      parse(p, "ax");
      assert.fail("expected error");
    } catch (e: any) {
      assert.deepEqual(e.nameStack, []);
    }
  });

  it("should collect token completion events on empty input", () => {
    const completions: string[][] = [];
    const p = P.choice(P.token("if"), P.token("while"), P.token("for"));
    try { parse(p, "", false, undefined, e => completions.push([...e.nameStack])); } catch {}
    assert.equal(completions.length, 3);
  });

  it("should include nameStack in completion events", () => {
    const completions: string[][] = [];
    const p = P.named(P.choice(P.token("if"), P.token("while")), "keyword");
    try { parse(p, "", false, undefined, e => completions.push([...e.nameStack])); } catch {}
    assert.ok(completions.length === 2 && completions.every(ns => ns[0] === "keyword"));
  });

  it("should report partial prefix completion when no full match exists", () => {
    const hits: number[] = [];
    const p = P.choice(P.token("gout"), P.token("gother"));
    try { parse(p, "go", false, undefined, () => hits.push(1)); } catch {}
    assert.equal(hits.length, 2);
  });

  it("should pass userContext in completion events", () => {
    const ctx = { events: [] as string[] };
    const P2 = new ParserBuilder<typeof ctx>();
    const p = P2.named(P2.choice(P2.token("if"), P2.token("while")), "kw");
    const received: (typeof ctx)[] = [];
    try { parse(p, "", false, ctx, e => received.push(e.userContext as typeof ctx)); } catch {}
    assert.ok(received.length === 2 && received.every(c => c === ctx));
  });
});

describe("ParseObserver / observe operator", () => {
  it("should invoke enter callback before parsing", () => {
    const ctx: TestContext = { events: [] };
    const P2 = new ParserBuilder<TestContext>();
    const parser = P2.token("hello")._(
      ParserOperators.observe<TestContext, string>({
        enter: (c) => c.events.push("enter"),
      }),
    );
    parse(parser, "hello", false, ctx);
    assert.deepEqual(ctx.events, ["enter"]);
  });

  it("should invoke leave callback with successful result after parsing", () => {
    const ctx: TestContext = { events: [] };
    const P2 = new ParserBuilder<TestContext>();
    const parser = P2.token("hello")._(
      ParserOperators.observe<TestContext, string>({
        leave: (c, result) => {
          c.events.push(
            result.successful ? `leave:${result.result}` : "leave:fail",
          );
        },
      }),
    );
    parse(parser, "hello", false, ctx);
    assert.deepEqual(ctx.events, ["leave:hello"]);
  });

  it("should invoke leave callback with failed result on parse failure", () => {
    const ctx: TestContext = { events: [] };
    const P2 = new ParserBuilder<TestContext>();
    const parser = P2.choice(
      P2.token("hello")._(
        ParserOperators.observe<TestContext, string>({
          leave: (c, result) => {
            c.events.push(result.successful ? "leave:ok" : "leave:fail");
          },
        }),
      ),
      P2.token("world"),
    );
    parse(parser, "world", false, ctx);
    assert.deepEqual(ctx.events, ["leave:fail"]);
  });

  it("should invoke both enter and leave callbacks", () => {
    const ctx: TestContext = { events: [] };
    const P2 = new ParserBuilder<TestContext>();
    const parser = P2.token("hello")._(
      ParserOperators.observe<TestContext, string>({
        enter: (c) => c.events.push("enter"),
        leave: (c, result) =>
          c.events.push(result.successful ? "leave:ok" : "leave:fail"),
      }),
    );
    parse(parser, "hello", false, ctx);
    assert.deepEqual(ctx.events, ["enter", "leave:ok"]);
  });

  it("should pass userContext through to nested parsers", () => {
    const ctx: TestContext = { events: [] };
    const P2 = new ParserBuilder<TestContext>();
    const inner = P2.token("b")._(
      ParserOperators.observe<TestContext, string>({
        enter: (c) => c.events.push("inner-enter"),
      }),
    );
    const outer = P2.sequence(
      P2.token("a")._(
        ParserOperators.observe<TestContext, string>({
          enter: (c) => c.events.push("outer-enter"),
        }),
      ),
      inner,
    );
    parse(outer, "ab", false, ctx);
    assert.deepEqual(ctx.events, ["outer-enter", "inner-enter"]);
  });

  it("should work without context when no userContext is passed", () => {
    const P2 = new ParserBuilder();
    let called = false;
    const parser = P2.token("hi")._(
      ParserOperators.observe({
        enter: () => {
          called = true;
        },
      }),
    );
    parse(parser, "hi");
    assert.ok(called);
  });
});
