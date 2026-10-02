import assert from "assert";
import "mocha";
import { ParserBuilder } from "../src/builder";
import { parse, Parser } from "../src/core";
import { WhitespaceParser } from "../src/parsers/WhitespaceParser";
import { StandardOperators } from "../src/standardOperators";

abstract class Node {
  abstract readonly nodeType: string;
}

class Block extends Node {
  constructor(public statements: Node[]) {
    super();
  }

  nodeType = "block";
}

class IfThenElseStatement extends Node {
  constructor(
    public conditionBlock: Block,
    public thenBlock: Block,
    public elseBlock: Block | null,
  ) {
    super();
  }

  nodeType = "ite";
}

class WhileStatement extends Node {
  constructor(
    public conditionBlock: Block,
    public body: Block,
  ) {
    super();
  }

  nodeType = "while";
}

class RepeatStatement extends Node {
  constructor(
    public conditionBlock: Block,
    public body: Block,
  ) {
    super();
  }

  nodeType = "repeat";
}

class ObjectLiteral extends Node {
  constructor(public content: string) {
    super();
  }

  nodeType = "literal";
}

class FrameInvokeNode extends Node {
  constructor(
    public capturedVars: string[],
    public block: Block,
  ) {
    super();
  }

  nodeType = "frame";
}

class LocalStoreNode extends Node {
  constructor(public variable: string) {
    super();
  }

  nodeType = "localStore";
}

const P = new ParserBuilder(new WhitespaceParser(false)).withExtension(
  StandardOperators,
);

const tok_start_program = P.token("<<");
const tok_end_program = P.token(">>");
const tok_frame_start = P.token("->");

const object_literal = P.anyOf("0123456789").map((s) => new ObjectLiteral(s));
const var_name = P.anyOf("abcdefghijklmnopqrstuvwxyz");

let block: Parser<Block>;

const frame_invoke = P.sequence(
  tok_frame_start.omit(),
  P.cut(),
  P.many(var_name),
  tok_start_program.omit(),
  P.ref(() => block),
  tok_end_program.omit(),
).build(FrameInvokeNode);

const ite_statement = P.sequence(
  P.token("IF").omit(),
  P.cut(),
  P.ref(() => block),
  P.token("THEN").omit(),
  P.ref(() => block),
  P.sequence(P.token("ELSE").omit(), P.ref(() => block))
    .map((s) => s[0])
    .optional(),
  P.token("END").omit(),
).build(IfThenElseStatement);

const while_statement = P.sequence(
  P.token("WHILE").omit(),
  P.cut(),
  P.ref(() => block),
  P.token("DO").omit(),
  P.ref(() => block),
  P.token("END").omit(),
).build(WhileStatement);

const repeat_statement = P.sequence(
  P.token("REPEAT").omit(),
  P.cut(),
  P.ref(() => block),
  P.token("UNTIL").omit(),
  P.ref(() => block),
  P.token("END").omit(),
).build(RepeatStatement);

const local_store = P.sequence(var_name, P.token("=").omit())
  .whitespace(P.pass())
  .build(LocalStoreNode);

block = P.sequence(
  P.many(
    P.choice(
      frame_invoke,
      ite_statement,
      while_statement,
      repeat_statement,
      local_store,
      object_literal,
    ),
  ),
).build(Block);

const program = P.sequence(tok_start_program, block, tok_end_program).map(
  (v) => v[1],
);

const nodeTypes = (b: Block) => b.statements.map((s) => s.nodeType);

describe("Program parser (standard extensions)", () => {
  it("should match linear program", () => {
    const r: Block = parse(program, "<< 123 456 >>");
    assert.deepStrictEqual(nodeTypes(r), ["literal", "literal"]);
  });

  it("should support IF THEN", () => {
    const r = parse(program, "<< IF 23 THEN 11 END >>");
    const ite = r.statements[0] as IfThenElseStatement;
    assert.strictEqual(ite.nodeType, "ite");
    assert.strictEqual(ite.elseBlock, null);
  });

  it("should support IF THEN ELSE", () => {
    const r = parse(program, "<< 123 456 IF 23 22 THEN 11 ELSE 99 END >>");
    assert.deepStrictEqual(nodeTypes(r), ["literal", "literal", "ite"]);
    const ite = r.statements[2] as IfThenElseStatement;
    assert.deepStrictEqual(nodeTypes(ite.conditionBlock), ["literal", "literal"]);
    assert.deepStrictEqual(nodeTypes(ite.elseBlock!), ["literal"]);
  });

  it("should support WHILE...DO...END", () => {
    const r = parse(program, "<< 123 456 WHILE 23  DO 11  END >>");
    assert.deepStrictEqual(nodeTypes(r), ["literal", "literal", "while"]);
  });

  it("should support REPEAT...UNTIL...END", () => {
    const r = parse(program, "<< 123 456 REPEAT 23 22 UNTIL 11  END >>");
    assert.deepStrictEqual(nodeTypes(r), ["literal", "literal", "repeat"]);
  });

  it("should support frames and local stores", () => {
    const r = parse(program, "<< -> ab cd << x= 1 >> >>");
    const frame = r.statements[0] as FrameInvokeNode;
    assert.strictEqual(frame.nodeType, "frame");
    assert.deepStrictEqual(frame.capturedVars, ["ab", "cd"]);
    assert.deepStrictEqual(nodeTypes(frame.block), ["localStore", "literal"]);
  });

  it("should support fail on missing END", () => {
    assert.throws(() => {
      parse(program, "<< 123 456 IF 23 22 THEN 11 >>  ");
    });
  });

  it("should support complex program", () => {
    const r = parse(
      program,
      "<< WHILE 2 DO 123 456 IF 23 22 THEN 11 ELSE REPEAT 99 UNTIL 22 END END END >>",
    );
    const loop = r.statements[0] as WhileStatement;
    assert.deepStrictEqual(nodeTypes(loop.body), ["literal", "literal", "ite"]);
    const ite = loop.body.statements[2] as IfThenElseStatement;
    assert.deepStrictEqual(nodeTypes(ite.elseBlock!), ["repeat"]);
  });
});
