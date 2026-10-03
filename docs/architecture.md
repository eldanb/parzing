# Parzing — Architecture

> This file is kept up to date by Claude Code after every working session. Last updated: 2026-10-03 (error recovery, steps 1-5: recovered failures, recovery-mode parse(), recoverWith, recovery in sequence/choice/many, many `until`, skipUntil, ref loop guard; choice follows the cut protocol; lookahead ignores completion and counts commitment).

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
│  MapParser         │  SkipUntilParser               │
│  AstBuilder        │                                │
│  AttemptParser     │                                │
│  ParserWithIndices │                                │
│  NamedParser       │                                │
│  RecoveringParser  │                                │
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
- `onIncompleteParseOption()` — called by leaf parsers when they fail at EOF; sets `ranIntoEof` and fires the `onCompletion` callback supplied to `parse()` with a snapshot of `userContext` and `nameStack`
- `ranIntoEof` — a boolean flag set by `onIncompleteParseOption()`. Recovery code saves/clears/restores it around a sub-parse (like `cutEncountered`) to tell whether that sub-parse failed because input ran out
- `recovering` — true when `parse()` was called with `recover = true`; `strictly(fn)` runs `fn` with it temporarily off
- `withoutCompletionEvents(fn)` — runs `fn` with completion events muted (`ranIntoEof` is still set); used for speculative lookahead
- `completionEnabled` — true when an `onCompletion` callback was supplied

### `ParseResult<T>`
A discriminated union: `{ successful: true; result: T }` or `ParseFailure<T>` = `{ successful: false; parseError: ParseError; recovered?: Recovered<T> }`. Returned by every `parse()` call.

In recovery mode a failure may carry `recovered: { result: T; errors: ParseError[] }` — a best-effort value of the parser's own type plus the errors encountered producing it. A failure carrying a recovery is still a failure: every combinator backtracks exactly as in strict mode, and only recovery-aware code uses `recovered`. By convention, such a failure leaves the input positioned at the end of the recovered text. `ParseResult.forwardFailure(f, fn)` passes a failure on while mapping its recovered value; result-transforming combinators (`MapParser`, `AstBuilder`, `ParserWithIndices`) use it so recovered values are transformed like successful ones.

The top-level `parse()` function unwraps the result and throws on failure. Its 6th argument `recover = true` runs the parse in recovery mode; the signature and return type are unchanged. A clean parse returns the result as usual. Otherwise it throws a `ParseError` whose `recovered` field holds `{ result, errors }`: the best-effort result plus every error (including `End of input expected` for leftover input, unless `allowPartial` is set). If nothing recovered, the plain error is thrown without `recovered`.

### `ParseError`
Carries a human-readable `message` with position info (`at <offset> ('<preview>')`). Also carries `nameStack: readonly string[]` (a snapshot captured at error time from `ParserContext.nameStack`). If non-empty, the name stack is prepended to the message as `[outer > inner] ...`. `reason` is the raw message without name-stack prefix or position (used by `ChooseCombinator` to describe its alternatives). `offset` is the input position (`tell()`) when the error was raised; `length` (default 0) marks the size of a skipped range for errors produced by recovery. `recovered` is set only on the error thrown by a recovery-mode `parse()`; `withRecovered()` creates that error as a copy, so it is never inside its own `recovered.errors`.

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
| `RefParser<T, C>` | Lazily resolves to a parser returned by a callback; enables recursive grammars. In recovery mode, re-entering the same `RefParser` at the same input position while it is still active there fails without recovery ("Recursion without progress"): zero-width recoveries could otherwise recurse forever. The active positions are tracked per `ParserContext` in a `WeakMap`. In strict mode such a re-entry is left recursion and behaves as before. |
| `ParserWithInternalWhitespaceSupport<T, C>` | Base class for combinators that skip whitespace between sub-parsers; exposes `.whitespace(ws)` (returns `this`, so postfix support survives the call) |

`ParserType<P>` and `ParserContextType<P>` extract the result and context types of a parser type.

---

## Primitive Parsers (`src/parsers/`)

| File | Class | Matches | Result type |
|---|---|---|---|
| `TokenParser.ts` | `TokenParser` | Exact string | `string` |
| `AnyOfParser.ts` | `AnyOfParser` | Characters from a set, with min/max length | `string` |
| `RegexParser.ts` | `RegexParser` | A RegExp anchored at the current position | `string` |
| `WhitespaceParser.ts` | `WhitespaceParser` | Space / tab / newline; optional or mandatory | `void` |
| `SkipUntilParser.ts` | `SkipUntilParser` — `parser.skipUntil(terminator)` | Everything up to (not including) a match of `terminator`, or to EOF; always succeeds. The terminator is tried by strict lookahead and never at EOF. Intended as a building block for `recoverWith` recoveries | `string` |

**AnyOfParser optimisation**: for character sets where all characters are ASCII (code < 256), the parser builds a 32-entry number-array bitmap at construction time and uses bitwise lookups at runtime instead of `String.indexOf`.

**RegexParser constraint**: delegates to `ParserInput.readRegex`, which is optional on the interface. Throws if the input doesn't support it. `StringParserInput` implements it by calling `regex.exec` on the remaining substring and checking that the match starts at index 0.

---

## Combinators (`src/combinators/`)

### `SequenceCombinator<TS>` — `parser.sequence(...parsers)`
Runs parsers left-to-right on consecutive fragments of input. Collects non-`void` results into a tuple typed as `SeqType<TS>` (using the `FilterVoid` mapped type). Supports whitespace skipping between elements via `ParserWithInternalWhitespaceSupport`.

**Recovery mode:** an element that fails with a recovery contributes its recovered value (filtered for `undefined` like any result) and parsing continues from where the recovery ended. An element that fails without one fails the whole sequence with no recovery — a sequence never invents values. If any element recovered, the sequence returns a failure carrying the full tuple and all collected errors.

Both `SequenceCombinator` and `ManyCombinator` collect errors with the internal helper `RecoveryErrors` (`src/utils/RecoveryErrors.ts`, not exported): `add(first, all?)` records errors, and `result(value)` returns a plain success if nothing was recorded, otherwise a failure carrying `value` as its recovery.

### `ChooseCombinator<E>` — `parser.choice(...parsers)`
Tries each alternative in order; on failure, rewinds to the pre-attempt bookmark and tries the next. Follows the cut protocol: saves `cutEncountered` and clears it before each alternative, so a cut that happened *before* the choice (e.g. `sequence(a, cut, choice(x, y))`) doesn't stop it after the first alternative. If an alternative fails after its own cut, no further alternatives are tried and the flag stays set for callers; otherwise the saved value is restored. When every alternative fails, the error reads `Expected one of: …`, naming each alternative by the first name it pushed (`named()`), or else by its error's `reason`. Result type is the union of all alternative result types.

**Recovery mode:** if no alternative succeeds (and none cut), returns the recovery of the alternative that ended furthest in the input (ties go to the earlier alternative), leaving the input at its end.

### `ManyCombinator<T>` — `parser.many(parser, sep?, min?, max?, until?)`
Greedy repetition. Parses as many occurrences as possible, optionally separated by `sep`. Fails if the count is outside `[min, max]`; when there are too few elements because an element failed, that element's error is reported (it says more than the count). Handles cut correctly within both the item parser and the separator: saves/clears/restores `cutEncountered` around each sub-parse, and propagates failures without backtracking when a cut is active. Extends `ParserWithInternalWhitespaceSupport`. Implemented as a loop alternating between expecting an element and expecting a separator; attempting the same one at the same position twice ends the loop (so e.g. `many(optional(x))` terminates instead of looping forever).

**Recovery mode.** `until` is an optional lookahead describing what may follow the list; it is never consumed and only used in recovery mode. Every failed attempt (element or separator) answers one question — *end of list, or error?* It is an error if it is an element required after a separator, if it cut, or (when it may recover) if `until` is set and neither it nor EOF is at the attempt's start. Otherwise the list ends normally.

An error fails the list unless the attempt *may recover*: recovery mode is on, and not (the attempt ran into EOF while a completion callback is set) — the same EOF rule as `recoverWith`. A recoverable error is resolved by:
- keeping the attempt's recovery if it has one, even a zero-width one such as an inserted `Missing` (an element's recovered value goes into the list; a separator's just counts as a separator), otherwise
- skipping junk: advance character by character until the element, the separator or `until` matches (or EOF), and continue at whatever matched (`until`/EOF ends the list). A non-empty skip records `Unexpected input` with `offset`/`length`; an empty one records the attempt's own error (a missing element or separator). Without `until` nothing says where the list ends, so the skip never moves: it either finds the separator right here (missing element) or ends the list.

If anything was recovered or skipped, `many` returns a failure carrying the list and the errors (after the usual `[min, max]` check, which fails without recovery).

All lookaheads go through the internal helper `lookahead()` (`src/utils/lookahead.ts`, also used by `SkipUntilParser`). It runs the parser strictly and with completion events muted (a lookahead is speculative; if parsing then continues at that position, the real parse fires its own events), then restores the input position, `cutEncountered` and `ranIntoEof`. It reports a match if the parser succeeded **or committed** (failed after a cut): a cut says "this is one of mine", so junk skipping lands on a broken element (e.g. a term with a missing value) instead of skipping over it.

### `OptionalCombinator<T>` — `parser.optional(parser)`
Wraps a parser: on success returns the result; on failure (without a cut) backtracks and returns `null`. Cut-safe: saves and restores `cutEncountered`. In recovery mode this means a recovery is discarded without a cut and passed on (as part of the failure) after one.

### `MapParser<V, T, C>` — `parser.map(parser, fn)` / `ParserOperators.map(fn)`
Transforms the result of an underlying parser with a mapping function. Pass-through on failure. `C` defaults to `ParserContextType<V>`, so the context type is inferred from a concretely-typed input parser.

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


### `RecoveringParser<T, R, C>` — `ParserOperators.recoverWith(z)`
The only source of recovered values. Outside recovery mode it is transparent. In recovery mode it:
1. Runs the inner parser **strictly** (`ctx.strictly`), so recoveries nested inside it don't run — `z` overrides them. Returns the result if it succeeds.
2. On failure, if the inner parser ran into EOF (`ranIntoEof`, saved/cleared/restored around the call) **and** a completion callback is set, returns the failure unrecovered: at the cursor, a failure means "not typed yet", and inventing input there would produce bogus completion events downstream.
3. Otherwise seeks back to its start and runs `z` (in recovery mode). `z`'s own cuts are hidden; the inner parser's cut state is what outer combinators see. A successful `z` yields `failed(innerError, { result: z.result, errors: [innerError] })`; a `z` that fails with its own recovery contributes that recovery and its errors; a `z` that fails outright leaves the inner failure unrecovered.

The result type is `T | R`, so recovery values appear in the type exactly where the grammar author introduced them.
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
- Everything from `src/core.ts` (`Parser`, `ParserInput`, `ParserContext`, `ParseResult`, `ParseError`, `StringParserInput`, `parse`, `isParser`, `RefParser`, `CutParser`, `FailParser`, `PassParser`, `ParserType`, `ParserContextType`, `ParserWithInternalWhitespaceSupport`, `CompletionEvent`)
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
