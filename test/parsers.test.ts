import assert from 'assert'
import { parse } from '../src/core';
import { AnyOfParser } from '../src/parsers/AnyOfParser';
import { TokenParser } from '../src/parsers/TokenParser';
import { SequenceCombinator } from '../src/combinators/SequenceCombinator';

describe('Token Parser', () => {
    it('should return token if found', () => {
        const tokParser = new TokenParser('token');
        const parseResult = parse(tokParser, 'token');
        assert.equal(parseResult, 'token');
    })

    it('should return token if found with suffix', () => {
        const tokParser = new TokenParser('token');
        const parseResult = parse(tokParser, 'tokenbroken', true);
        assert.equal(parseResult, 'token');
    })

    it('should throw if at eof', () => {
        assert.throws(() => {
            const tokParser = new TokenParser('token');
            parse(tokParser, 'tok');                
        })
    })

    it('should throw if token doesnt match', () => {
        assert.throws(() => {
            const tokParser = new TokenParser('token');
            parse(tokParser, 'tolen');                
        })
    })
})


describe('AnyOf Parser', () => {
    it('should return token if found when occ=1', () => {
        const tokParser = new AnyOfParser('abcde1234', 1, 1);
        const parseResult = parse(tokParser, 'dzzzz', true);
        assert.equal(parseResult, 'd');
    })

    it('should return token if found when occ between min and max', () => {
        const tokParser = new AnyOfParser('abcde1234', 1, 3);
        const parseResult = parse(tokParser, 'dezzzz', true);
        assert.equal(parseResult, 'de');
    })

    it('should restore parse context to previous state before encountering a non-anyof character', () => {
        const anyofParser = new AnyOfParser('abcde1234');
        const secondAnyOfParser = new AnyOfParser('zwx');
        const seqParser = new SequenceCombinator([anyofParser, secondAnyOfParser]);

        const parseResult = parse(seqParser, 'dezwx', true);
        assert.deepEqual(parseResult, ['de', 'zwx']);
    })

    it('should not throw if EOF encountered', () => {
        const tokParser = new AnyOfParser('abcde1234');
        const parseResult = parse(tokParser, 'deba1');
        assert.equal(parseResult, 'deba1');
    })

    it('should throw if found > max', () => assert.throws(() => {
        const tokParser = new AnyOfParser('abcde1234', 1, 3);
        const parseResult = parse(tokParser, 'deabzzzz');
        })
    )

    it('should throw if found < min', () => assert.throws(() => {
            const tokParser = new AnyOfParser('abcde1234');
            const parseResult = parse(tokParser, 'zzzz');
        })
    )

})