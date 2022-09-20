import assert from 'assert'
import { ParserBuilder } from '../src/builder';
import { parse } from '../src/core';
import { WhitespaceParser } from '../src/parsers/WhitespaceParser';

const P = new ParserBuilder();

describe('Sequence Combinator', () => {
    it('should return sequence of parsers if found', () => {
        const tokParser = P.sequence(
            P.token('token1'), 
            P.token('token2'))
        const parseResult = parse(tokParser, 'token1token2');
        assert.deepEqual(parseResult, ['token1', 'token2']);
    })

    it('should return sequence of parsers with whitespace if found', () => {
        const tokParser = P.sequence(
            P.token('token1'), 
            P.token('token2')
            ).whitespace(new WhitespaceParser(true));
        const parseResult = parse(tokParser, 'token1   token2');
        assert.deepEqual(parseResult, ['token1', 'token2']);
    })

    it('should return sequence of parsers with optional whitespace if found', () => {
        const tokParser = P.sequence(
            P.token('token1'), 
            P.token('token2')
            ).whitespace(new WhitespaceParser(false));
        const parseResult = parse(tokParser, 'token1   token2');
        assert.deepEqual(parseResult, ['token1', 'token2']);
    })


    it('should accept sequence of parsers without optional whitespace', () => {
        const tokParser = P.sequence(
            P.token('token1'), 
            P.token('token2')
            ).whitespace(new WhitespaceParser(false));
        const parseResult = parse(tokParser, 'token1token2');
        assert.deepEqual(parseResult, ['token1', 'token2']);
    })

    it('should fail if mandatory whitespace not found', () => {
        assert.throws(() => {
            const tokParser = P.sequence(
                P.token('token1'), 
                P.token('token2')
                ).whitespace(new WhitespaceParser(true));
            parse(tokParser, 'token1token2');
        });
    })

    it('should not allow whitespace by default', () => {
        assert.throws(() => {
            const tokParser = P.sequence(
                P.token('token1'), 
                P.token('token2'));
            parse(tokParser, 'token1 token2');
            })
    })

    it('should throw if at eof', () => {
        assert.throws(() => {
            const tokParser = P.sequence(
                P.token('token1'), 
                P.token('token2'));
            parse(tokParser, 'token1');                    
        })
    })

    it('should throw if token doesnt match', () => {
        assert.throws(() => {
            const tokParser = P.sequence(
                P.token('token1'), 
                P.token('token2'));
            parse(tokParser, 'token1token3');                    
        })
    })
})

describe('Choice combinator', () => {
    it('should match first option if valid', () => {
        const choiceParser = P.choice(
            P.token('token1'),
            P.token('token2'),
            P.token('token3')
        );

        assert.equal(parse(choiceParser, 'token1'), 'token1');
        assert.equal(parse(choiceParser, 'token2'), 'token2');
        assert.equal(parse(choiceParser, 'token3'), 'token3');
    })

    it('should support rollback', () => {
        const choiceParser = P.choice<any>(
            P.token('token1'),
            P.sequence(P.token('token2'), P.token('token22')),
            P.sequence(P.token('token2'), P.token('token23'))
        );

        assert.deepEqual(parse(choiceParser, 'token2token23'), ['token2', 'token23']);
    })

    it('Should honor cut', () => {
        assert.throws(() => {
            const choiceParser = P.choice<any>(
                P.token('token1'),
                P.sequence(P.token('token2'), P.cut(), P.token('token22')),
                P.sequence(P.token('token2'), P.token('token23'))
            );

            parse(choiceParser, 'token2token23');
        });
    })
})



describe('Many combinator', () => {
    it('should match zero elements if allowed', () => {
        const choiceParser = P.many(P.choice(
            P.token('token1'),
            P.token('token2'),
            P.token('token3')
        ));

        assert.deepEqual(parse(choiceParser, ''), []);
    })

    it('should match multiple elements', () => {
        const choiceParser = P.many(P.choice(
            P.token('token1'),
            P.token('token2'),
            P.token('token3')
        ));

        assert.deepEqual(parse(choiceParser, 'token1token2token3token2'), ['token1', 'token2', 'token3', 'token2']);
    })

    it('should match multiple elements with separator and whitespace', () => {
        const choiceParser = P.many(P.choice(
            P.token('token1'),
            P.token('token2'),
            P.token('token3')
        ), P.token(','))
        .whitespace(new WhitespaceParser(false));

        assert.deepEqual(parse(choiceParser, 'token1 , token2, token3, token2'), ['token1', 'token2', 'token3', 'token2']);
    })

    it('should fail match if separator missing', () => {
        assert.throws(() => {
            const choiceParser = P.many(P.choice(
                P.token('token1'),
                P.token('token2'),
                P.token('token3')
            ), P.token(','));
    
            parse(choiceParser, 'token1,token2token3,token2');
        })
    })

    it('should fail match if bad seq element', () => {
        assert.throws(() => {
            const choiceParser = P.many(P.choice(
                P.token('token1'),
                P.token('token3')
            ));
    
            parse(choiceParser, 'token1token2token3token2');
        })
    })

    it('should fail match if terminated by separator', () => {
        assert.throws(() => {
            const choiceParser = P.many(P.choice(
                P.token('token1'),
                P.token('token2'),
                P.token('token3')
            ), P.token(','));

            parse(choiceParser, 'token1,token2,token3,token2,');
        })
    })

    it('should fail match if starts with separator', () => {
        assert.throws(() => {
            const choiceParser = P.many(P.choice(
                P.token('token1'),
                P.token('token2'),
                P.token('token3')
            ), P.token(','));

            parse(choiceParser, ',token1,token2,token3,token2,');
        })
    })

    it('should fail match if includes empty separator', () => {
        assert.throws(() => {
            const choiceParser = P.many(P.choice(
                P.token('token1'),
                P.token('token2'),
                P.token('token3')
            ), P.token(','));

            parse(choiceParser, 'token1,,token2,token3,token2');
        })
    })

    it('should fail match if too few occurences', () => {
        assert.throws(() => {
            const choiceParser = P.many(P.choice(
                P.token('token1'),
                P.token('token2'),
                P.token('token3')
            ), null, 3);

            parse(choiceParser, 'token1token2');
        })
    })

    it('Should honor cut in separator', () => {
        assert.throws(() => {
            const choiceParser = 
                P.sequence(
                    P.many(P.choice(
                        P.token('token1'),
                        P.token('token2'),
                        P.token('token3')
                    ), P.sequence(P.token('+'), P.cut(), P.token('+'))),
                    P.token('+'),
                    P.token('token7'));

            parse(choiceParser, 'token2++token2+token7');
        });
    })


    it('Should rollback failed separator', () => {
        const choiceParser = 
            P.sequence(
                P.many(P.choice(
                    P.token('token1'),
                    P.token('token2'),
                    P.token('token3')
                ), P.sequence(P.token('+'), P.token('+'))),
                P.token('+'),
                P.token('token7'));

        parse(choiceParser, 'token2++token2+token7');
    })


    it('Should honor cut in item', () => {
        assert.throws(() => {
            const choiceParser = 
                P.sequence(
                    P.many(P.choice(
                        P.token('token1'),
                        P.token('token2'),
                        P.token('token3'),
                        P.map(
                            P.sequence(P.token('m'), P.cut(), P.token('ust')),
                            (r) => r[0] + r[1])
                    )),
                    P.token('make'));

            parse(choiceParser, 'token2musttoken1make');
        });
    })


    it('Should rollback failed item', () => {
        const choiceParser = 
                P.sequence(
                    P.many(P.choice(
                        P.token('token1'),
                        P.token('token2'),
                        P.token('token3'),
                        P.map(
                            P.sequence(P.token('m'), P.token('ust')),
                            (r) => r[0] + r[1])
                    )),
                    P.token('make'));
                    
        assert.deepEqual(
            parse(choiceParser, 'token2musttoken1make'),
            [['token2', 'must', 'token1'], 'make']);
    })
})

describe('Optional combinator', () => {
    it('should match if exists', () => {
        const choiceParser = P.sequence(
            P.token('token1'),
            P.optional(P.token('token2')),
            P.token('token3')
        );

        assert.deepEqual(parse(choiceParser, 'token1token2token3'), ['token1', 'token2', 'token3']);
    })

    it('should return null if does not exit, and rollback', () => {
        const choiceParser = P.sequence(
            P.token('token1'),
            P.optional(P.token('token2')),
            P.token('token3')
        );

        assert.deepEqual(parse(choiceParser, 'token1token3'), ['token1', null, 'token3']);
    })

    it('should honor cut', () => {
        assert.throws(() => {
            const choiceParser = P.sequence(
                P.token('token1'),
                P.optional(P.sequence(P.token('tok'), P.cut(), P.token('en2'))),
                P.token('token3')
            );
    
            parse(choiceParser, 'token1token3');    
        })
    })

})

