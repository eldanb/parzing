import assert from 'assert'
import { ParserBuilder } from '../src/builder';
import { parse, Parser } from '../src/core';
import { ParserOperators } from '../src/operators';
import { WhitespaceParser } from '../src/parsers/WhitespaceParser';

abstract class Node {
    abstract readonly nodeType: string;
}

class Block extends Node {
    constructor(private _statements: Node[]) {
        super();
    }

    nodeType = "block";
}

class IfThenElseStatement extends Node {
    constructor(private _conditionBlock: Block, private _thenBlock: Block, private _elseBlock: Block | null) {
        super();
    }

    nodeType = "ite";
}

class WhileStatement extends Node {
    constructor(private _conditionBlock: Block, private _body: Block) {
        super();
    }

    nodeType = "while";
}

class RepeatStatement extends Node {
    constructor(private _conditionBlock: Block, private _body: Block) {
        super();
    }

    nodeType = "repeat";
}

class ObjectLiteral extends Node {
    constructor(private _content: string) {
        super();
    }

    nodeType = "literal";
}


class FrameInvokeNode extends Node {
    constructor(private _capturedVars: string[], private _block: Block) {
        super();
    }

    nodeType = "frame";
}


class LocalStoreNode extends Node {
    constructor(private _var: string) {
        super();
    }

    nodeType = "localStore";
}

const P = new ParserBuilder(new WhitespaceParser(false));
import O = ParserOperators;

const tok_start_program = P.token("<<");
const tok_end_program = P.token(">>");
const tok_frame_start = P.token("->");

const object_literal = P.anyOf("0123456789")._(O.map((s) => new ObjectLiteral(s)));
const var_name = P.anyOf("abcdefghijklmnopqrstuvwxyz");

let block: Parser<Block>;

const frame_invoke = P.sequence(
    tok_frame_start._(O.omit()), 
    P.cut(),
    P.many(var_name),
    tok_start_program._(O.omit()),
    P.ref(() => block),
    tok_end_program._(O.omit())
)._(O.build(FrameInvokeNode));

const ite_statement = P.sequence(
    P.token('IF')._(O.omit()),
    P.cut(),
    P.ref(() => block),
    P.token('THEN')._(O.omit()),
    P.ref(() => block),    
    P.sequence(
        P.token('ELSE')._(O.omit()),
        P.ref(() => block)
    )._(O.map((s) => s[0]))._(O.optional()),    
    P.token('END')._(O.omit())
)._(O.build(IfThenElseStatement))

const while_statement = P.sequence(
    P.token('WHILE')._(O.omit()),
    P.cut(),
    P.ref(() => block),
    P.token('DO')._(O.omit()),
    P.ref(() => block),
    P.token('END')._(O.omit())
)._(O.build(WhileStatement))
    
const repeat_statement = P.sequence(
    P.token('REPEAT')._(O.omit()),
    P.cut(),
    P.ref(() => block),
    P.token('UNTIL')._(O.omit()),
    P.ref(() => block),
    P.token('END')._(O.omit())
)._(O.build(RepeatStatement));

const local_store = 
    P.sequence(var_name, P.token('=')._(O.omit()))._(O.whitespace(P.pass()))._(O.build(LocalStoreNode));
      
block = 
    P.sequence(
        P.many(
            P.choice(
                frame_invoke, 
                ite_statement,
                while_statement,
                repeat_statement,
                local_store,
                object_literal
            )
        )
    )._(O.build(Block))

const program = P.sequence(tok_start_program, block, tok_end_program)._(O.map((v) => v[1]));

describe('Program parser', () => {
    it('should match linear program', () => {
        parse(program, 
            "<< 123 456 >>");
    })

    it('should support IF THEN', () => {
        console.log(JSON.stringify(
        parse(program, 
            "<< IF 23 THEN 11 END >>")
        ));
    })

    it('should support IF THEN ELSE', () => {
        console.log(JSON.stringify(parse(program, 
            "<< 123 456 IF 23 22 THEN 11 ELSE 99 END >>")));
    })

    it('should support WHILE...DO...END', () => {
        parse(program, 
            "<< 123 456 WHILE 23  DO 11  END >>");
    })

    it('should support REPEAT...UNTIL...END', () => {
        parse(program, 
            "<< 123 456 REPEAT 23 22 UNTIL 11  END >>");
    })

    it('should support fail on missing END', () => {
        assert.throws(() => {
            parse(program, 
                "<< 123 456 IF 23 22 THEN 11 >>  ");    
        })
    })


    it('should support complex program', () => {
        console.log(JSON.stringify(parse(program, 
            "<< WHILE 2 DO 123 456 IF 23 22 THEN 11 ELSE REPEAT 99 UNTIL 22 END END END >>")));
    })

})