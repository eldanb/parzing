# Parzing: TypesSript Parser Combinator Library

## Overview
This package is Parzing: a parser combinator library, allowing client code to easily create parsers in JavaScript or TypeScript. When used with TypeScript accurate types are computed for parsed and intermediate results, allowing easy and safe implementation and use of parsers.

This page provides instructions on how to use and customize Parzing. For more insights about the library, [see this blog](https://www.imonlydoingthis.benhaim.net/home/categories/parzing).

## Installation

```
npm install --save @zigsterz/parzing
```

## Parsing Basics

Parzing exposes a `parse` function for invoking a parser on content. To use it, we first construct a parser, and then pass the parser along with the content to parse.  `parse` will either return a the result of succesfuly parsing the content, or throw an error describing a failure to parse.

The parser passed to `parse` is usually built using the `ParserBuilder` class. This class exposes a set of helper factory functions for constructing parsers.

The example below demonstrates how to parse a sequence of 1 to 3 digits by first constructing a `ParserBuilder`, then using it to create an `AnyOfParser` parser and finally running the parser using `parse`.

```typescript
import { ParserBuilder, parse } from 'parzing';

const pb = new ParserBuilder();

const result = parse(pb.anyOf("0123456789", 1, 3), "123", true);
assert(result == "123");

```

### Parsing Results
The result of parsing content may be a value of any type. A Parzing parser has an associated result type that describes the type of the parsing result returned by that parser.
The return type from `parse` will match the result type of the parser passed to it.

### Basic Parsers

In the example above, `pb.anyOf` creates the Any Of *basic parser*. Basic parsers are the atomic building blocks for parsing. They may be combined using [*parser combinators*](#parser-combinators) to construct more complex parsers. 

Parzing offers the following basic parsers out of the box:

| Parser constructor | Description | Result type |
| ------------------ | ----------- | ----------- | 
| `ParserBuilder.anyOf(chars, min, max)` | Parses a minimum of *min* characters, and up to *max* characters, all out the characters listed in *chars*. | `string` |
| `ParserBuilder.token(token)` | Parses the exact string specified by *token*. | `string` |
| `ParserBuilder.regex(regex)` | Parses the regular expression specified by *regex*. | `string` |
| `ParserBuilder.pass()` | This is a no-op parser. It consumes no input and always succeeds. | `void` |
| `ParserBuilder.fail(message)` | Fail parsing with the error message provided in *message*. | `void` |
| `ParserBuilder.skipUntil(terminator)` | Skips input up to (not including) the first position where *terminator* matches, or to the end of input. Always succeeds. Mainly a building block for [error recovery](#error-recovery). | `string` (the skipped text) |
| `ParserBuilder.cut()` | Consumes nothing; marks that parsing has committed to the current alternative. See [Cuts](#cuts). | `void` |

In addition to these parsers, you can create [custom parsers](#custom-parsers) to parse arbitrary complex "atoms". Custom parsers may provide any result type.

## Creating Complex Parsers

### Parser Combinators
*Parser Combinators* are parsers constructed based on other parsers that combine these parsers in some form to generate a more complex parser. 

Perhaps the simplest example of a parser combinator is the Sequence combinator. 
The sequence combinator is constructed based on a sequence of underlying parsers, using the `ParserBuilder.sequence(...)` factory method.
When parsing input content, the combinator will invoke each of the underlying parsers to parse consecutive fragments of the content. 
If any underlying parser fails, the sequence parser fails as well. 
If all underlying parsers succeed, the parse result is an array that consists of the underlying parsers' parse results. 

The following example shows how to construct a parser that expects three digits separated by a dash:

```typescript
import { ParserBuilder, parse } from 'parzing';
import { strict as assert } from 'node:assert';

const pb = new ParserBuilder();
const sample_parser = pb.sequence(
  pb.anyOf("0123456789"),
  pb.token("-"),
  pb.anyOf("0123456789"),
  pb.token("-"),
  pb.anyOf("0123456789")
);

const result = parse(sample_parser, "1-2-3", true);
assert.deepEqual(result, ["1", "-", "2", "-", "3"]);
```

In addition to the `sequence` parser combinator, the following parser combinators are offered by Parzing out-of-the box:

| Parser constructor | Description | Result type |
| ------------------ | ----------- | ----------- |
| `ParserBuilder.sequence(parser, ...)` | Parse a sequence of elements: invoke the provided parsers one after the other on consecutive fragments of the input. Succeed with their results if all succeed; fail if any fails. Results of type `void` (e.g. from [`omit()`](#parser-operators)) are left out. | A typed tuple, each element typed as the corresponding parser's result type (minus `void` ones). |
| `ParserBuilder.choice(parser, ...)` | Parse one of several alternatives: try each parser in turn on the same input until one succeeds, and return its result. Fail if none succeeds. | Union of the parsers' result types. |
| `ParserBuilder.many(parser, separator?, min?, max?, until?)` | Parse repeated occurrences of `parser`, optionally separated by `separator`. Fail if there are fewer than `min` occurrences, or (when `max` is positive) more than `max`. `until` describes what may follow the list; it is only used in [recovery mode](#error-recovery). | An array of `parser`'s result type. |
| `ParserBuilder.optional(parser)` | Optionally parse: return `parser`'s result if it succeeds, otherwise `null` (instead of failing). | `parser`'s result type, or `null`. |
| `ParserBuilder.map(parser, mapper)` | Map results: if `parser` succeeds, return `mapper` applied to its result. | `mapper`'s return type. |
| `ParserBuilder.attempt(parser)` | Run `parser`, but hide any [cut](#cuts) it encounters from the enclosing parsers. | `parser`'s result type. |
| `ParserBuilder.named(parser, name)` | Run `parser` with `name` pushed onto the name stack, which labels error messages and [completion events](#completion). | `parser`'s result type. |
| `ParserBuilder.ref(() => parser)` | A lazy reference to a parser defined later; needed for [recursive grammars](#recursive-parsers). | The referenced parser's result type. |
| `ParserBuilder.parser(parser)` | Wrap a [custom parser](#custom-parsers) so it gets the builder's whitespace handling and operator support. | `parser`'s result type. |

### Whitespace Support

Parsers that derive from `ParserWithInternalWhitespaceSupport` support ignoring whitespace within parsed content. Exactly where whitespace is ignored depends on the specific parser as per the table below. 

For all of these parsers, the ignored "whitespace" is defined as content that can be parsed by the *whitespace parser*. The whitespace parser can be set by invoking `target_parser.whitespace(whitespace_parser)`. 
If there's no set whitespace parser on a `ParserWithInternalWhitespaceSupport`, no whitespace will be ignored.

If the `whitespace` method is not invoked on a parser, and the parser was created using `ParserBuilder`, then the whitespace parser is set as the default whitespace parser for the builder. The default whitespace parser for a `ParserBuilder` can be set by passing it on construction.

The `WhitespaceParser` class implements a parser that accepts common whitespace patterns. 

The following code example illustrates a few ways to set whitespace parsers:

```typescript
import { ParserBuilder, WhitespaceParser } from 'parzing';

// Builder without default whitespace parser
const pb1 = new ParserBuilder();

// Builder with default whitespace parser
const pb2 = new ParserBuilder(new WhitespaceParser(false)); 

// No whitespace parser; will accept 'hellohello' but not 'hello hello'
const p1 = pb1.many(pb1.token('hello'));

// Default whitespace parser from pb2; will accept 'hello hello' but not 'hellohello'
const p2 = pb2.many(pb2.token('hello'));

// Specified whitespace parser; will accept 'hello hello' but not 'hellohello'
const p3 = pb1.many(pb1.token('hello')).whitespace(new WhitespaceParser(false));
```

Parzing parsers that support whitespace (derived from  `ParserWithInternalWhitespaceSupport`) are listed below:

| Parser |  Builder factory method | Whitespace behavior |
| ------ | ----------------------- | ------------------- |
| `ManyCombinator` | `ParserBuilder.many` | Invoke whitespace parser between occurrences of underlying parser. | 
| `SequenceCombinator` | `ParserBuilder.sequence` | Invoke whitespace parser among between underlying parsers. | 

### Cuts

Some parser combinators may recover from parsing errors by offering alternative parsing options:

  - The `ChooseCombinator` (typically constructed through `ParserBuilder.choice`) combinator may attempt a different parser if a parser alternative failed.
  - The `OptionalCombinator` (typically constructed through `ParserBuilder.optional`) combinator may pass on parsing content if the underlying parser fails.
  - The `ManyCombinator` (typically constructed through `ParserBuilder.many`) may backtrack a failed parse, realizing that the sequence of "many" occurences was terminated.

  Such recovery and backtracking behavior may lead to hard to understand parsing errors. For example, consider the following parser:


```typescript
import { assert } from 'console';
import { parse, ParserBuilder, WhitespaceParser } from 'parzing';

// Builder without default whitespace parser
const pb = new ParserBuilder(new WhitespaceParser(false));

const parser = pb.choice(
  pb.sequence(
    pb.token('number'),
    pb.anyOf('0123456789', 1)
  ),

  pb.sequence(
    pb.anyOf('abcdefghijklmnopqrstuvwxyz', 1),
    pb.anyOf('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1)
  )
)

assert(parse(parser, 'number a123', true));
```

This parser will fail, but the failure will be reported by the `choice` combinator after exhausting all of its options. Indeed running this code will result in the following exception:

```
ParseError { message: "Expected one of: Expecting AnyOf 0123456789, Expecting AnyOf ABCDEFGHIJKLMNOPQRSTUVWXYZ at 0 ('numbe')" }
```

Clearly, for the input `number a123` a more reasonable behavior would be if the parser didn't even try the second alternative in the `choice` combinator above, and immediately bail out if we've encountered the `number` token. In Parzing, This kind of behavior can be achieved using *cuts*. 

A cut is a special parser, constructed using `ParserBuilder.cut`, that doesn't attempt to consume any input. Rather, 
When a cut 'parses', the fact that it was encountered is recored in the parsing context. Backtracking parsers, such as the ones listed above, will not attempt to backtrack parsing if a cut was encountered by one of their underlying parsers. Rather they will immediately fail with whatever failure that would have caused them to backtrack.

Fixing the example above using cuts, we can write:

```typescript
import { assert } from 'console';
import { parse, ParserBuilder, WhitespaceParser } from 'parzing';

// Builder without default whitespace parser
const pb = new ParserBuilder(new WhitespaceParser(false));

const parser = pb.choice(
  pb.sequence(
    pb.token('number'),
    pb.cut(),
    pb.anyOf('0123456789', 1)
  ),

  pb.sequence(
    pb.anyOf('abcdefghijklmnopqrstuvwxyz', 1),
    pb.anyOf('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1)
  )
)

assert(parse(parser, 'number a123', true));
```

which would now result in the following exception:

```
ParseError { message: "Expecting AnyOf 0123456789 at 7 ('a123')" }
```

Clearly a more useful error message. Note that in addition to yielding clearer errors, cuts may also improve parsing performance by preventing backtracks.

There are cases where you may want to reuse the same parser in different contexts -- where in some contexts you want the cut to appear but in others you want the cut to be ignored. This is achieved by invoking ``ParserBuilder.attempt`` on the parser which will return an ``AttemptCombinator``. This combinator parser will "swallow" any cut encountered indication within the underlying parser.

### Parser Operators

Parser operators allow specifying transformations on parsers in postfix notation. This notation makes  chaining transformations more readable. 

For example, consider the following two equivalent examples for creating a parser that reads "true" or "false" and converts to boolean:

```typescript

import { ParserBuilder, ParserOperators } from 'parzing';

const pb = new ParserBuilder();

const noOperators = pb.choice(
  pb.map(pb.token("true"), (s) => true),
  pb.map(pb.token("false"), (s) => false)
);

const useOperators = pb.choice(
  pb.token("true")._(ParserOperators.map((s) => true)),
  pb.token("false")._(ParserOperators.map((s) => false))  
);

```

To apply an operator on a parser created using `ParserBuilder`, invoke the `_` method of the parser and pass it the operator. You can chain such operator applications:

```typescript

const optionalInt = pb.anyOf("0123456789")._(ParserOperators.map((s) => Number.parseInt(s)))._(ParserOperators.optional())
```

Parzing offers the following operators out of the box. Note that you can also create your own [custom operators](#custom-operators).

| Operator | Description |
| -------- | ----------- |
| `ParserOperators.map(mapper)` | Equivalent to `ParserBuilder.map(parser, mapper)`. |
| `ParserOperators.optional()` | Equivalent to `ParserBuilder.optional(parser)`. |
| `ParserOperators.build(ctor)` | Constructs an object by invoking constructor `ctor` with the elements of the parser's (tuple) result as arguments. |
| `ParserOperators.omit()` | Maps the result of the parser to `void`. Inside a `sequence`, the parser then doesn't contribute to the result tuple. |
| `ParserOperators.whitespace(whitespaceParser)` | Only applicable to parsers with whitespace support; sets the whitespace parser. |
| `ParserOperators.withIndices()` | Wraps the parser's result as `{ result, start, length }`: the result plus the offset and length of the input the parser consumed. |
| `ParserOperators.named(name)` | Equivalent to `ParserBuilder.named(parser, name)`. |
| `ParserOperators.observe({ enter?, leave? })` | Calls `enter(userContext)` before the parser runs and `leave(userContext, parseResult)` after it, without affecting the result. Useful for tracking state in the user context, e.g. for [completion](#completion). |
| `ParserOperators.recoverWith(z)` | In [recovery mode](#error-recovery), if the parser fails, parse with `z` from the same position instead and use its result as the recovery. Result type `T \| R`. |
| `ParserOperators.orRecoverWith(z)` | Like `recoverWith`, but only a fallback: the parser recovers as usual, and `z` runs only if it fails with no recovery of its own. |

### Recursive Parsers

Grammars often include recursive definitions. Consider for example the following simple expresion parser grammer: 

```
expression := addition | subtraction
addition := term '+' term
subtraction := term '-' term
term := number | '(' expression ')'
````

How would we define this using Parzing? 

```typescript
import { ParserBuilder } from 'parzing';

const pb = new ParserBuilder();

const term = pb.choice(
  pb.anyOf("0123456789"),
  pb.sequence(
    pb.token("("),
    expression, /// Ooops!
    pb.token(")")
  )    
);

const addition = pb.sequence(
  term, 
  pb.token("+"),
  term
);


const subtraction = pb.sequence(
  term, 
  pb.token("-"),
  term
);

const expression = pb.choice(addition, subtraction);
```

Note the comment "Ooops!" above. The recursive nature of the parser creates a circular declaration, which is disallowed in Typescript.

The `ParserBuilder.ref` method allows solving  this problem by receiving a parameterless function returning a parser, and creating a parser that lazily resolves to the function's return value. 
Using this mechanism, our recursive parser becomes possible by modifying the code above as follows:


```typescript
import { ParserBuilder } from 'parzing';

const pb = new ParserBuilder();

const term = pb.choice(
  pb.anyOf("0123456789"),
  pb.sequence(
    pb.token("("),
    pb.ref(() => expression), /// Now we're good!
    pb.token(")")
  )    
);

const addition = pb.sequence(
  term, 
  pb.token("+"),
  term
);


const subtraction = pb.sequence(
  term, 
  pb.token("-"),
  term
);

const expression = pb.choice(addition, subtraction);
```

## Error Recovery

By default, `parse` stops at the first syntax error. Editors and similar tools often need more: a best-effort result for broken input (to color it, outline it or check the rest of it), plus every error found along the way. Parzing supports this through *recovery mode*.

### Parsing in recovery mode

Pass `true` as the 6th argument of `parse`. If the input is valid, `parse` returns its result as usual. Otherwise it throws a `ParseError` whose `recovered` field holds the best-effort result and every error, each with its `offset`, `length` (non-zero for skipped input) and `reason`:

```typescript
import { parse, ParseError } from 'parzing';

try {
  const result = parse(parser, text, false, undefined, undefined, true);
  // valid input
} catch (e) {
  if (e instanceof ParseError && e.recovered) {
    const { result, errors } = e.recovered;   // best-effort result, all errors
  } else {
    throw e;                                    // nothing could be recovered
  }
}
```

### Saying how to recover

Recovery is opt-in: the grammar says where and how to recover, using two operators:

- `ParserOperators.recoverWith(z)`: if the parser fails, parse with `z` from the same position instead, and use `z`'s result as the recovered value. The parser's result type becomes `T | R`, so recovered values show up in the types exactly where you introduced them. `pb.pass()` (insert something missing) and `pb.skipUntil(terminator)` (skip broken input) are typical choices for `z`. `recoverWith` *replaces* whatever recovery the parser could have done internally.
- `ParserOperators.orRecoverWith(z)`: the same, but as a fallback: the parser recovers as usual, and `z` runs only if nothing inside it could recover.

The combinators then carry recovered values upwards:

- `sequence` keeps a failed element's recovered value and continues after it. A sequence with an element that fails *without* a recovery has no recovery either: it never makes values up.
- `choice`, when no alternative succeeds, returns the recovery that got furthest into the input.
- `many` keeps an element's recovery when the element has committed with a [cut](#cuts), and leaves out a missing element after a separator. Given `until` (what may follow the list), it also treats anything else at the end of the list as junk: it skips it, records an error, and continues at the next element, separator or `until`.
- `optional` keeps a recovery only after a cut; otherwise it returns `null` as usual.

Cuts matter here: a cut says "this is the right alternative", which turns a failure after it into an error to recover from rather than a reason to try something else.

For example, a block of assignments that recovers from a missing `=`, a missing value, a missing `;` and junk between assignments:

```typescript
import { parse, ParseError, ParserBuilder, ParserOperators as O, WhitespaceParser } from 'parzing';

const pb = new ParserBuilder(new WhitespaceParser(false));

const assignment = pb.sequence(
  pb.regex(/[a-z]+/),
  pb.cut(),                                                            // a name commits to an assignment
  pb.token('=')._(O.omit())._(O.recoverWith(pb.pass())),              // missing '=': carry on
  pb.regex(/[0-9]+/)._(O.recoverWith(pb.pass()._(O.map(() => null)))), // missing value: null
  pb.token(';')._(O.omit())._(O.recoverWith(pb.pass())),              // missing ';': carry on
);

const block = pb.sequence(
  pb.token('{')._(O.omit()),
  pb.many(assignment, undefined, 0, 0, pb.token('}')),                // until '}': skip junk
  pb.token('}')._(O.omit()),
)._(O.map(([assignments]) => assignments));

try {
  parse(block, '{ a = 1; b 2; c = ; ?? d = 4; }', false, undefined, undefined, true);
} catch (e) {
  if (e instanceof ParseError && e.recovered) {
    e.recovered.result;   // [["a", "1"], ["b", "2"], ["c", null], ["d", "4"]]
    e.recovered.errors;   // "Expected token =" at 11, "Expected [0-9]+" at 18,
                          // "Unexpected input" at 20 (length 3)
  }
}
```

In strict mode (without the 6th argument) the same grammar behaves exactly as if the recovery annotations weren't there.

## Completion

Parzing can tell you what could come next at a given position, which is the basis for completion in an editor. Parse the text *up to the cursor* and pass a completion callback as the 5th argument of `parse`. Whenever a basic parser runs out of input (it is called at the end of the input, or a token's text is cut short by it), the callback is invoked with a `CompletionEvent`:

- `nameStack`: the names (see `named`) of the parsers that were active. Name the things you want to complete, e.g. `field`, `operator`, or individual keywords.
- `userContext`: the user context passed to `parse`, which the grammar can update while parsing (e.g. with `observe`) to describe the situation at the cursor, such as which field a value belongs to.

Since every alternative that reaches the cursor reports, one call collects all the options:

```typescript
import { parse, ParserBuilder, ParserOperators as O, WhitespaceParser } from 'parzing';

const pb = new ParserBuilder(new WhitespaceParser(false));
const command = pb.sequence(
  pb.choice(pb.token('get'), pb.token('set'))._(O.named('verb')),
  pb.regex(/[a-z]+/)._(O.named('key')),
);

function expectedAt(textBeforeCursor: string): string[] {
  const names: string[] = [];
  try {
    parse(command, textBeforeCursor, false, undefined, (e) => names.push(e.nameStack[e.nameStack.length - 1]));
  } catch {
    // the text up to the cursor is usually incomplete
  }
  return names;
}

expectedAt('');      // ["verb", "verb"]  (one event each for 'get' and 'set')
expectedAt('s');     // ["verb"]          ('s' could still become 'set')
expectedAt('get ');  // ["key"]
```

Combine completion with [recovery](#error-recovery) by also passing `true` as the 6th argument: errors *before* the cursor are then recovered from, so completion still works further along a broken text. At the cursor itself nothing is recovered while a completion callback is set: a failure there just means "not typed yet", which is exactly what completion reports.

Current limitations: events don't say where the incomplete token starts, and a basic parser that matches all the way to the cursor (like `ag`, a complete-looking identifier) reports nothing. Editors can work around both by completing at the start of the word under the cursor and filtering the suggestions by what has been typed of it.

## Extending Parzing

### Custom Parsers

Custom parsers can be created by implementing the `Parser<T>` interface: 

```typescript
export interface Parser<T> {
    parse(parserContext: ParserContext): ParseResult<T>;
}
```

The `T` type parameter represents the parser result type.

The `ParserContext` class provides the parser with access to the content to parse, as well as additional context that flows through the parsing process. 

`ParseResult<T>` is a type that represents either succesful parsing or failed parsing accompanied with a result. 

Your parser implementation will typically use `ParserContext.input` to obtain access to the parsed input (implementing `ParserInput`). The input is represented as a stream with an option to take bookmarks and seek back to them. 

To read information from the input stream use `ParserInput.read()`. To peek at information without taking it out of the stream, use `ParserInput.peek()`. On entry to your parser's `parse` method, the stream will be positioned at the first character that your parser is requested to parse. At the end of parsing the input stream must be positioned on the character past the last character that was succesfuly parsed by your parser.

#### Backtracking and handling Cuts

Some parsers may need to backtrack -- go back to a position in the stream that they have already visited. This is done by invoking `ParserInput.getBookmark()` to obtain an opaque bookmark to the current stream position, and `ParserInput.seekToBookmark()` to seek back to the previosuly fetched position.

When implemeneting a parser combinator that may backtrack, be mindful of [cuts](#cuts). When a `cut` parser is invoked, it turns on `ParserContext.cutEncountered`. You should avoid backtracking if during the excution of an underlying parser this flag was turned on. To use this flag effectively, you should follow this pattern:

  - Save the current state of the `cutEncountered` flag before invoking an underlying parser
  - Set the `cutEncountered` flag to `false`
  - Invoke an underlying parser
  - Check if `cutEncountered` is true. If it is -- avoid further backtraces
  - Restore previous value of `cutEncountered`. 

The following implementation of the `optional` combinator illustrates how to handle backtracking and cuts:

```typescript
export class OptionalCombinator<T> implements Parser<T | null> {
    constructor(private _parser: Parser<T>) {                
    }

    parse(parserContext: ParserContext): ParseResult<T | null> {
        const input = parserContext.input;
        
        // Take a bookmark to the current position;
        // if our underlying parser fails we'll
        // restore that position (as if we didn't
        // read anything).
        const bm = input.getBookmark();

        // Remember whether a cut was encountered before
        // invoking the underlying parser. 
        // If underlying parser will fail, we will
        // restore this value.
        const pce = parserContext.cutEncountered;

        // Clear the 'cut encountered' flag to 
        // trace whether a cut is encountered strictly
        // within our underlying parser's operation
        parserContext.cutEncountered = false;
        let ret = this._parser.parse(parserContext);        

        // If underlyilng parser failed --
        // we return a null result and rewind the 
        // input stream to where it was before our parse operation.
        if(!ret.successful && !parserContext.cutEncountered) {
            input.seekToBookmark(bm);
            ret = ParseResult.successful(null);
        }

        // Restore cut encountered flag
        parserContext.cutEncountered = pce;
        return ret;
    }
}
```

#### Whitespace and Operator Support

By deriving your parser from `ParserWithInternalWhitespaceSupport` you can benefit from API-consistent whitespace handling. If you derive from this class, invoke `ParserWithInternalWhitespaceSupport.parseWhitespace` from your parser whenever you want to skip whitespace.

To support `ParserBuilder` integration, when after constructing your parser pass it to `ParserBuilder.parser`. This will:

  - Apply default whitespace handling as set for the parser builder if your parser is derived from `ParserWithInternalWhitespaceSupport`
  - Add support for applying operators on your parser.

### Custom Operators

Implementing custom operators is easy. Just implement a function that returns a function that receives the source parser and returns the target parser. You can restrict the source parser type if you need to.

As an example, here's the implementation of the `ParserOperators.map` operator:

```typescript

function map<S, T>(mapper: (s: S) => T) {
    return (p: Parser<S>) => {
        return new MapParser(p, mapper);
    }
}
```

## Change List

### Version 1.5.0

- **Error recovery.** `parse()` takes a new, optional 6th argument, `recover`. In recovery mode, a parse that hits syntax errors can still produce a best-effort result: instead of a plain error, `parse()` throws a `ParseError` whose `recovered` field holds `{ result, errors }`, with the recovered result and every error encountered. A clean parse returns its result as before.
- **`ParserOperators.recoverWith(z)`.** In recovery mode, if the wrapped parser fails, `z` is run from the same start position and its result is used in place of the failed one. The result type becomes `T | R`. Failures at end of input are not recovered while a completion callback is set, so completion only ever sees what was actually typed.
- **`ParserOperators.orRecoverWith(z)`.** Like `recoverWith`, but a fallback: the wrapped parser recovers as usual, and `z` runs only if it fails without any recovery of its own.
- **Recovery in `sequence`, `choice` and `many`.** A sequence keeps an element's recovered value and continues after it. A choice with no successful alternative returns the recovery that got furthest. `many` keeps recovered elements that are committed by a cut, and leaves out a missing element after a separator.
- **`ParserBuilder.many(parser, sep?, min?, max?, until?)`.** The new `until` argument describes what may follow the list. It is used only in recovery mode, as lookahead: where the list would otherwise stop and `until` doesn't match, the input is treated as junk and skipped, and parsing continues at the next element, separator or `until`.
- **`ParserBuilder.skipUntil(terminator)`.** Skips input up to (not including) `terminator`, or to the end of input, and returns the skipped text. Useful as a recovery, e.g. `stmt._(ParserOperators.recoverWith(pb.skipUntil(pb.token(';'))))`.
- **Recursion guard in recovery mode.** A recursive rule (`ParserBuilder.ref`) that is re-entered at the same position without consuming input fails instead of recursing forever. This can only happen through zero-width recoveries; strict parsing is unaffected.
- **`ParserContext.withoutCompletionEvents(fn)`.** Runs `fn` with completion events muted. Recovery's speculative lookaheads use it, so completion only reports what the real parse tries.
- **`ParseError.offset` and `ParseError.length`.** The position of the error, and the size of the skipped range for errors produced by recovery.
- **Breaking: `choice` no longer stops early after an earlier cut.** A cut *before* a choice in the same sequence (e.g. `sequence(a, cut(), choice(x, y))`) used to stop the choice after its first failing alternative; the choice now tries every alternative, as the cut protocol requires. A cut *inside* an alternative still stops it. Grammars with a cut before a choice may now accept input they used to reject.
- **Clearer error messages.** A failing `choice` now says what its alternatives expected (`Expected one of: (, field`), using `named()` names where available, instead of `Parser rejected input`. `many` reports a failed element's error when that leaves it with too few elements, and states count limits plainly (`Expected at least 2 occurrences; found 1`). Mandatory whitespace reports `Expected whitespace`. Errors at offset 0 now include their position. `ParseError` gains `reason`, the message without name-stack prefix or position.
- **`many` no longer loops forever** when an iteration consumes no input (for example `many(optional(x))` on input that doesn't match `x`); it now stops.

## License and Credits
Parzing is Copyright (c) 2021, 2022 Eldan Ben-Haim. 
Licensed under MIT license.