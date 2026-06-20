# Parzing — Architecture

> This file is kept up to date by Claude Code after every working session. Last updated: 2026-06-20 (parsing context, observe operator, named parser + completion).

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
│  NamedParser       │                                │
├────────────────────┴────────────────────────────────┤
│  Core (core.ts)                                     │
│  Parser<T>  ParserInput  ParserContext  ParseResult  │
│  ParseError  StringParserInput  RefParser  CutParser │
│  CompletionEvent                                    │
└─────────────────────────────────────────────────────┘
```

---

## Core Abstractions (`src/core.ts`)

### `Parser<T, C = unknown>`
The fundamental interface. Every parser — primitive or composite — implements:
```ts
interface Parser<T, C = unknown> {
  parse(parserContext: ParserContext<C>): ParseResult<T>;
}
```
`T` is the result type. `C` is the **user context type** (defaults to `unknown` for backward compatibility). Combinators propagate and combine both types statically. Parsers with `C = unknown` can be used inside any context-typed grammar through TypeScript's bivariant method checking.

### `ParserInput` / `StringParserInput`
An abstraction over the input stream. Supports:
- `read(n)` / `peek(n)` — consume or inspect `n` characters
- `readRegex(re)` / `peekRegex(re)` — optional regex-based reads (implemented by `StringParserInput`)
- `getBookmark()` / `seekToBookmark(bm)` — save and restore position (used for backtracking)
- `tell()` — current offset (used by `ParserWithIndices`)
- `eof()` — end-of-input test

`StringParserInput` is the default implementation; custom inputs can implement `ParserInput` directly.

### `ParserContext<C = unknown>`
Wraps a `ParserInput` and carries cross-parser state:
- `input` — the stream being parsed
- `cutEncountered` — a boolean flag set by `CutParser`; suppresses backtracking in combinators
- `userContext: C` — caller-supplied context object, passed to `parse()` and threaded through the entire parse; accessible in `ParseObserver` callbacks and `CompletionEvent`
- `nameStack: readonly string[]` — stack of names pushed by `NamedParser`; read by `ParseError` and `CompletionEvent` to provide human-readable location context
- `onIncompleteParseOption()` — called by leaf parsers when they fail at EOF; fires the `onCompletion` callback supplied to `parse()` with a snapshot of `userContext` and `nameStack`

### `ParseResult<T>`
A discriminated union: `{ successful: true; result: T }` or `{ successful: false; parseError: ParseError }`. Returned by every `parse()` call. The top-level `parse()` function unwraps this and throws on failure.

### `ParseError`
Carries a human-readable `message` with position info (`at <offset> ('<preview>')`). Also carries `nameStack: readonly string[]` (a snapshot captured at error time from `ParserContext.nameStack`). If non-empty, the name stack is prepended to the message as `[outer > inner] ...`.

### `CompletionEvent<C = unknown>`
Fired by `ParserContext.onIncompleteParseOption()` when a leaf parser encounters EOF. Contains `userContext: C` and `nameStack: readonly string[]` — both snapshotted at the time of the event. Collected via the `onCompletion` callback passed to `parse()`. Multiple events may fire per `parse()` call (one per branch that hits EOF).

**Leaf parsers that fire completion events:**
- `TokenParser` — when `peek(n)` returns fewer chars than the token length AND the partial string is a prefix of the token (covers both "called at EOF" and "partial match" cases)
- `AnyOfParser` — when the char-reading loop exits due to EOF and count < minLen
- `RegexParser` — when invoked at EOF (position already exhausted before regex is tried)

### Special parsers in core
| Class | Behaviour |
|---|---|
| `FailParser<C>` | Always fails with a given message |
| `PassParser<C>` | Always succeeds, returns `void` |
| `CutParser<C>` | Sets `ParserContext.cutEncountered = true`; used to prevent backtracking |
| `RefParser<T, C>` | Lazily resolves to a parser returned by a callback; enables recursive grammars |
| `ParserWithInternalWhitespaceSupport<T, C>` | Base class for combinators that skip whitespace between sub-parsers; exposes `.whitespace(ws)` |

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

### `ParserWithIndices<T, C>` — `ParserOperators.withIndices()`
Wraps a parser and returns `{ result, start, length }` — the original result alongside the start offset and consumed-character count. Uses `ParserInput.tell()`.

### `ParseObserver<T, C>` — `ParserOperators.observe(callbacks)`
Wraps a parser with optional `enter` and `leave` callbacks that receive the typed user context `C`. `enter(ctx)` is called before the inner parser runs; `leave(ctx, result)` is called after, regardless of success or failure, receiving the full `ParseResult<T>`. Neither callback can affect the parse result — they are pure side effects for enriching the context object. Does not touch `cutEncountered`.

### `NamedParser<T, C>` — `parser.named(parser, name)` / `ParserOperators.named(name)`
Wraps a parser with a name label. Before invoking the inner parser, pushes `name` onto `ParserContext.nameStack`; pops it afterward (via `try/finally`). The name stack propagates into `ParseError.nameStack` (for human-readable error context) and into `CompletionEvent.nameStack` (for labelling completion options). Does not affect parse results or `cutEncountered`.

---

## Builder & Operators (`src/builder.ts`, `src/operators.ts`)

### `ParserBuilder<C = unknown>`
The recommended way to construct parsers. Generic on the user context type `C`; defaults to `unknown` for backward compatibility. All factory methods return parsers typed as `Parser<result, C>`. Holds an optional default whitespace parser (`_ws`). Each factory method calls `postProcessParser`, which:
1. Applies `_ws` to parsers that extend `ParserWithInternalWhitespaceSupport`.
2. Adds `._()` support (via `addPostfixSupport`) so operators can be chained.

Factory methods: `token`, `anyOf`, `regex`, `fail`, `pass`, `cut`, `ref`, `attempt`, `map`, `sequence`, `choice`, `many`, `optional`, `named`.

### `ParserOperators` namespace
Stateless operator factories intended for use with the `._()` postfix API. Each returns `(parser) => newParser`. Available: `map`, `optional`, `build`, `omit`, `whitespace`, `withIndices`, `observe`, `named`.

### Postfix operator support (`addPostfixSupport`)
Wraps any value with a `_` method: `parser._(op)` applies `op(parser)` and wraps the result with the same `_` support, allowing chains like:
```ts
pb.anyOf("0-9")._(O.map(Number.parseInt))._(O.optional())
```

---

## Public API (`src/parzing.ts`)

Re-exports:
- Everything from `src/builder.ts` (`ParserBuilder`, `addPostfixSupport`)
- Everything from `src/combinators/NamedParser.ts` (`NamedParser`)
- Everything from `src/combinators/ParseObserver.ts` (`ParseObserver`, `ParseObserverCallbacks`)
- Everything from `src/core.ts` (`Parser`, `ParserInput`, `ParserContext`, `ParseResult`, `ParseError`, `StringParserInput`, `parse`, `isParser`, `RefParser`, `CutParser`, `FailParser`, `PassParser`, `ParserType`, `ParserWithInternalWhitespaceSupport`, `CompletionEvent`)
- Everything from `src/operators.ts` (`ParserOperators`)
- `WhitespaceParser` from `src/parsers/WhitespaceParser.ts`

Note: the primitive parsers (`TokenParser`, `AnyOfParser`, `RegexParser`) and most combinators are **not individually re-exported**. Users access them through `ParserBuilder` factory methods and `ParserOperators`.

## User Context (`C` type parameter)

All parsers carry a phantom `C = unknown` type parameter representing the caller-supplied context type. To use a typed context:

1. Instantiate `new ParserBuilder<MyCtx>()` — all factory methods will return `Parser<result, MyCtx>`.
2. Wrap specific parsers with `ParserOperators.observe<MyCtx, ResultType>({ enter?, leave? })` to inspect or mutate the context at parse points.
3. Call `parse(rootParser, input, false, myCtxInstance)` to run the grammar with a concrete context value.

Context-unaware parsers (`Parser<T, unknown>`) mix freely into any context-typed grammar through TypeScript's bivariant method checking, so primitive parsers from an untyped builder can be used inside a typed one without casts.

To collect **completion events** (for intellisense / autocomplete):
1. Pass `onCompletion: (e: CompletionEvent<C>) => void` as the 5th argument to `parse()`.
2. Wrap parsers at meaningful positions with `named(parser, "label")` to annotate the `nameStack` in completion events.
3. After a failed (or even successful-but-partial) parse, the callback will have been called once per grammar branch that hit EOF. Deduplicate by `nameStack` if desired.

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
