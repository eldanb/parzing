# Parzing: TypesSript Parser Combinator Library

## Overview
This package implements a parser combinator system, allowing client code to easily create parsers in JavaScript or TypeScript. When used with TypeScript accurate types are computed for parsed and intermediate results, allowing quick and safe implementation and utilization of parsers.

## Installation

```
npm install --save @zigsterz/parzing
```

## Parsing Basics

Parzing exposes a `parse` function for invoking a parser on content. To use it, we first construct a parser, and then pass the parser along with the content to parse.  `parse` will either return a the result of succesfuly parsing the content, or throw an error describing a failure to parse.

The `ParserBuilder` class exposes a set of helper factory functions for constructing parser.

The example below demonstrates how to parse a sequence of 1 to 3 digits by first constructing a `ParserBuilder`, then using it to create an `AnyOfParser` parser and finally running the parser using `parse`.

```typescript
import { ParserBuilder, parse } from 'parzing';

const pb = new ParserBuilder();

const result = parse(pb.anyOf("0123456789", 1, 3), "123", true);
assert(result == "123");

```

### Parsing Results
The result of parsing content may be a value of any type. A Parzing parser has an associated result type that describes the type of the parsing result returned by that parser.


### Basic Parsers

`pb.anyOf` creates the Any Of *basic parser*. Basic parsers are the atomic building blocks for parsing. They may be combined using [*parser combinators*](#parser-combinators) to construct more complex parsers. 

Parzing offers the following basic parsers out of the box:

| Parser constructor | Description | Result type |
| ------------------ | ----------- | ----------- | 
| `ParserBuilder.anyOf(chars, min, max)` | Parses a minimum of *min* characters, and up to *max* characters, all out the characters listed in *chars*. | `string` |
| `ParserBuilder.token(token)` | Parses the exact string specified by *token*. | `string` |
| `ParserBuilder.pass()` | This is a no-op parser. It consumes no input and always succeeds. | `void` |
| `ParserBuilder.fail(message)` | Fail parsing with the error message provided in *message*. | `void` |

In addition to these parsers, you can create [custom parsers](#custom-parsers) to parse arbitrary complex "atoms". Customer parsers may provide any result type.

## Creating Complex Parsers

### Parser Combinators
*Parser Combinators* are parsers that are constructed based on other parsers, and combine these parsers in some form to generate a more complex parser. 

Perhaps the simplest example of a paser combinator is the Sequence combinator. 
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

In addition to the `sequence` parser combinator, the following parser combinators offered by Parzing out-of-the box:

| Parser constructor | Description | Result type |
| ------------------ | ----------- | ----------- | 
| `ParserBuilder.sequence(parser,...)`| Parse a sequence of elements: Invoke the provided parsers one after the other on consecutive fragments of the input. Return a sequence made of the results returned by the various parsers if all were succesful. Fail if any underlying parser failed. | A typed tuple (array) with each element typed as the corresponding underlying parser's result type.
| `ParserBuilder.choice(parser, ...))` | Parse one of several alternatives: Attempt invoking each of the provided parsers one after the other on the input, until a parser succeeds in parsing the input. Return the result obtained from that parser on the input. If no parser was able to parse, fail parsing. | Union type of the result types of underlying parsers.
| 
| `ParserBuilder.many(parser, separator?, min?, max?)` | Parse multiple occurences of the underlying `parser`. Optionally require at least `min` occurrences (fail otherwise). You can limit the number of parsed occurences to `max`; note that any additional occurences won't be parsed (may be processed by whatever parsers follow) but their existence won't fail the parser. If a `separator` parser is provided, it will be used to parse content between occurences. | An array of items of the same type as the result type of the underlying `parser`. |
|  `ParserBuilder.optional(parser)` | Optionally parse: Attempt to parse using the underlying parser. If parsing is succesful, return the parsed value. Otherwise return null (instead of failure). | A union between the underlying parser type and `null`. |
|
|  `ParserBuilder.map(parser, mapper)` | Map parser results: Attempt to parse content using the underlying `parser`. If parsing is succesful, return the result of applying the `mapper` on the underlying parser result. Otherwise indicate failure. | Return type of the `mapper` function. |
|

### Whitespace Support

Parsers that derive from `ParserWithInternalWhitespaceSupport` support ignoring whitespace within the content. Exactly where whitespace is ignored depends on the specific parser (see table below). 

For all of these parsers, the ignored "whitespace" is defined as content that can be parsed by the *whitespace parser*. The whitespace parser can be set by invoking `target_parser.whitespace(whitespace_parser)`. 
If this method is not invoked on the parser, and the parser was created using `ParserBuilder`, then the whitespace parser is set as the default whitespace parser for the builder. The default whitespace parser for a `ParserBuilder` can be set by passing it on construction.

If there's no set whitespace parser on a `ParserWithInternalWhitespaceSupport`, no whitespace will be ignored.

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

  - The `ChooseCombinator` (typically constructed through `ParserBuilder.choose`) combinator may attempt a different parser if a parser alternative failed.
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
ParseError { message: 'Parser rejected input' }
```

Clearly, for the input `number a123` a more approach would be to not even try the second alternative in the `choice` combinator above, and immediately bail out if we've encountered the `number` token. 
This kind of behavior can be achieved using cuts. A cut is a special parser, constructed using `ParserBuilder.cut`, that doesn't attempt to consume any input. Rather, 
When a cut 'parses', the fact that it was encountered is recored in the parsing context. Backtracking parsers, such as the ones listed above, will not attempt to backtrack parsing if a cut was encountered by one of their underlying parsers. Rather they will immediate fail with whatever failure that would have caused them to backtrack.

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

Clearly a more useful error message. Note that in addition to yielding clearer errors, cuts may also improve parsing performance since by preventing backtracks.

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
| `ParserOperators.build(ctor)` |  Transforms the parser to a parser that will construct an object by invoking constructor `ctor` with the parse result of the transformed parser. |
| `ParserOperators.omit()` | Maps the result of the parser to `void`. If this is included in a sequence parser combinator, the parser will not contribute to the sequence. |
| `ParserOperators.whitespace(whitespaceParser)` | Only applicable to parsers with whitespace support; sets the whitespace of the parser. |
| `ParserOperators.withIndices()` |  Transforms the parser to a parser that returns the original parser result wrapped in a struct that includes the start and end offsets into the parsed input that were processed by the parser. |
    
### Recursive Parsers

In many cases a language may include recursive grammar definitions. Consider for example the following simple expresion parser grammer: 

expression := addition | subtraction
addition := term '+' term
subtraction := term '-' term
term := number | '(' expression ')'

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

Note the comment "Ooops!" above. The recursive nature of the parser creates a circular declaration in Typescript, which is disallowed.

The `ParserBuilder.ref` method allows coping with this situation by receiving a parameterless function returning a parser, and creating a parser that lazily resolves to the function's return value. 
Using this mechanism, our recursive parser becomes possible by modifying the code above as follows:


```typescript
import { ParserBuilder } from 'parzing';

const pb = new ParserBuilder();

const term = pb.choice(
  pb.anyOf("0123456789"),
  pb.sequence(
    pb.token("("),
    pb.ref(expression), /// Now we're good!
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

## License and Credits
Parzing is Copyright (c) 2021, 2022 Eldan Ben-Haim. 
Licensed under MIT license.