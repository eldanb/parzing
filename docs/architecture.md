# Parzing — Architecture

> This file is kept up to date by Claude Code after every working session. Last updated: 2026-06-20.

## Purpose

Parzing is a **parser combinator library** for TypeScript. It provides typed building blocks (primitive parsers) and ways to compose them (combinators) into arbitrarily complex grammars. All type information flows through, so the result type of a composite parser is automatically inferred from its parts.

---

## Layer Model

```
┌─────────────────────────────────────────────────────┐
│                   User Code / Tests                 │
├─────────────────────────────────────────────────────┤
│  ParserBuilder (builder.ts)                         │  ← fluent factory; entry point for most users
│  ParserOperators (operators.ts)                     │  ← postfix-style transform helpers
├────────────────────┬────────────────────────────────┤
│  Combinators       │  Primitive Parsers             │
│  SequenceCombinator│  TokenParser                   │
│  ChooseCombinator  │  AnyOfParser                   │
│  ManyCombinator    │  RegexParser                   │
│  OptionalCombinator│  WhitespaceParser              │
│  MapParser         │                                │
│  AstBuilder        │                                │
│  AttemptParser     │                                │
│  ParserWithIndices │                                │
├────────────────────┴────────────────────────────────┤
│  Core (core.ts)                                     │
│  Parser<T>  ParserInput  ParserContext  ParseResult  │
│  ParseError  StringParserInput  RefParser  CutParser │
└─────────────────────────────────────────────────────┘
```

---

## Core Abstractions (`src/core.ts`)

### `Parser<T>`
The fundamental interface. Every parser — primitive or composite — implements:
```ts
interface Parser<T> {
  parse(parserContext: ParserContext): ParseResult<T>;
}
```
`T` is the result type. Combinators propagate and combine these types statically.

### `ParserInput` / `StringParserInput`
An abstraction over the input stream. Supports:
- `read(n)` / `peek(n)` — consume or inspect `n` characters
- `readRegex(re)` / `peekRegex(re)` — optional regex-based reads (implemented by `StringParserInput`)
- `getBookmark()` / `seekToBookmark(bm)` — save and restore position (used for backtracking)
- `tell()` — current offset (used by `ParserWithIndices`)
- `eof()` — end-of-input test

`StringParserInput` is the default implementation; custom inputs can implement `ParserInput` directly.

### `ParserContext`
Wraps a `ParserInput` and carries cross-parser state:
- `input` — the stream being parsed
- `cutEncountered` — a boolean flag set by `CutParser`; suppresses backtracking in combinators

### `ParseResult<T>`
A discriminated union: `{ successful: true; result: T }` or `{ successful: false; parseError: ParseError }`. Returned by every `parse()` call. The top-level `parse()` function unwraps this and throws on failure.

### `ParseError`
Carries a human-readable `message` with position info (`at <offset> ('<preview>')`).

### Special parsers in core
| Class | Behaviour |
|---|---|
| `FailParser` | Always fails with a given message |
| `PassParser` | Always succeeds, returns `void` |
| `CutParser` | Sets `ParserContext.cutEncountered = true`; used to prevent backtracking |
| `RefParser<T>` | Lazily resolves to a parser returned by a callback; enables recursive grammars |
| `ParserWithInternalWhitespaceSupport<T>` | Base class for combinators that skip whitespace between sub-parsers; exposes `.whitespace(ws)` |

---

## Primitive Parsers (`src/parsers/`)

| File | Class | Matches | Result type |
|---|---|---|---|
| `TokenParser.ts` | `TokenParser` | Exact string | `string` |
| `AnyOfParser.ts` | `AnyOfParser` | Characters from a set, with min/max length | `string` |
| `RegexParser.ts` | `RegexParser` | A RegExp anchored at the current position | `string` |
| `WhitespaceParser.ts` | `WhitespaceParser` | Space / tab / newline; optional or mandatory | `void` |

**AnyOfParser optimisation**: for character sets where all characters are ASCII (code < 256), the parser builds a 32-entry number-array bitmap at construction time and uses bitwise lookups at runtime instead of `String.indexOf`.

**RegexParser constraint**: delegates to `ParserInput.readRegex`, which is optional on the interface. Throws if the input doesn't support it. `StringParserInput` implements it by calling `regex.exec` on the remaining substring and checking that the match starts at index 0.

---

## Combinators (`src/combinators/`)

### `SequenceCombinator<TS>` — `parser.sequence(...parsers)`
Runs parsers left-to-right on consecutive fragments of input. Collects non-`void` results into a tuple typed as `SeqType<TS>` (using the `FilterVoid` mapped type). Supports whitespace skipping between elements via `ParserWithInternalWhitespaceSupport`.

### `ChooseCombinator<E>` — `parser.choice(...parsers)`
Tries each alternative in order; on failure, rewinds to the pre-attempt bookmark and tries the next. Stops immediately if `cutEncountered` is set (no further alternatives are tried). Result type is the union of all alternative result types.

### `ManyCombinator<T>` — `parser.many(parser, sep?, min?, max?)`
Greedy repetition. Parses as many occurrences as possible, optionally separated by `sep`. Fails if the count is outside `[min, max]`. Handles cut correctly within both the item parser and the separator: saves/clears/restores `cutEncountered` around each sub-parse, and propagates failures without backtracking when a cut is active. Extends `ParserWithInternalWhitespaceSupport`.

### `OptionalCombinator<T>` — `parser.optional(parser)`
Wraps a parser: on success returns the result; on failure (without a cut) backtracks and returns `null`. Cut-safe: saves and restores `cutEncountered`.

### `MapParser<V, T>` — `parser.map(parser, fn)` / `ParserOperators.map(fn)`
Transforms the result of an underlying parser with a mapping function. Pass-through on failure.

### `AstBuilder<Args, Ctor>` — `ParserOperators.build(Ctor)`
Spreads the array result of a parser as constructor arguments, returning an instance of `Ctor`. Intended to be used with `SequenceCombinator` + `ParserOperators.omit` to build typed AST nodes.

### `AttemptParser<T>` — `parser.attempt(parser)`
Runs the underlying parser and resets `cutEncountered` to `false` afterward. Lets a parser that internally uses cuts be embedded in a context where those cuts should not propagate outward.

### `ParserWithIndices<T>` — `ParserOperators.withIndices()`
Wraps a parser and returns `{ result, start, length }` — the original result alongside the start offset and consumed-character count. Uses `ParserInput.tell()`.

---

## Builder & Operators (`src/builder.ts`, `src/operators.ts`)

### `ParserBuilder`
The recommended way to construct parsers. Holds an optional default whitespace parser (`_ws`). Each factory method calls `postProcessParser`, which:
1. Applies `_ws` to parsers that extend `ParserWithInternalWhitespaceSupport`.
2. Adds `._()` support (via `addPostfixSupport`) so operators can be chained.

Factory methods: `token`, `anyOf`, `regex`, `fail`, `pass`, `cut`, `ref`, `attempt`, `map`, `sequence`, `choice`, `many`, `optional`.

### `ParserOperators` namespace
Stateless operator factories intended for use with the `._()` postfix API. Each returns `(parser) => newParser`. Available: `map`, `optional`, `build`, `omit`, `whitespace`, `withIndices`.

### Postfix operator support (`addPostfixSupport`)
Wraps any value with a `_` method: `parser._(op)` applies `op(parser)` and wraps the result with the same `_` support, allowing chains like:
```ts
pb.anyOf("0-9")._(O.map(Number.parseInt))._(O.optional())
```

---

## Public API (`src/parzing.ts`)

Re-exports:
- Everything from `src/builder.ts` (`ParserBuilder`, `addPostfixSupport`)
- Everything from `src/core.ts` (`Parser`, `ParserInput`, `ParserContext`, `ParseResult`, `ParseError`, `StringParserInput`, `parse`, `isParser`, `RefParser`, `CutParser`, `FailParser`, `PassParser`, `ParserType`, `ParserWithInternalWhitespaceSupport`)
- Everything from `src/operators.ts` (`ParserOperators`)
- `WhitespaceParser` from `src/parsers/WhitespaceParser.ts`

Note: the primitive parsers (`TokenParser`, `AnyOfParser`, `RegexParser`) and combinators are **not individually re-exported**. Users access them through `ParserBuilder` factory methods.

---

## Cut Signal Protocol

Any combinator that may backtrack must follow this protocol around `parserContext.cutEncountered`:

1. Save current value (`pce = parserContext.cutEncountered`).
2. Set to `false` before invoking sub-parser.
3. If sub-parser fails **and** `cutEncountered` is `true`, propagate failure without backtracking.
4. Restore saved value before returning.

This guarantees that a `CutParser` in a deeply nested sub-parser is seen by the immediately enclosing backtracking combinator, but does not leak further up the stack (unless that combinator also propagates the signal as a failure).

---

## Data Flow (typical parse)

```
User calls parse(rootParser, "input string")
  → wraps string in StringParserInput
  → creates ParserContext(input)
  → calls rootParser.parse(context)
       ↓ (recursive descent)
    ChooseCombinator tries alternatives
      → saves bookmark
      → calls SequenceCombinator.parse
           → TokenParser.parse (reads & compares)
           → CutParser.parse (sets cutEncountered)
           → AnyOfParser.parse (bitmap lookup)
      → if success: return result
      → if fail + no cut: seekToBookmark, try next alternative
  → unwraps ParseResult; throws ParseError on failure
  → checks eof unless allowPartial=true
```

---

## Versioning & Publishing

Package: `@zigsterz/parzing`, version in `package.json`.
Build: `npm run build` → `tsc` compiles `src/` to `dist/`, then `npm pack` creates a `.tgz`.
The published package ships only the `dist/` directory (declared in `files`).
