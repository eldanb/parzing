# Parzing — Claude Code Guide

## Project Overview

**@zigsterz/parzing** is a TypeScript parser combinator library. It lets users compose small, typed parsers into complex grammars using combinators. The library is published as an npm package and has no runtime dependencies.

## Repository Layout

```
src/
  core.ts                        — Core interfaces and primitives (Parser, ParserInput, ParseError, etc.)
  builder.ts                     — ParserBuilder: fluent factory class for constructing parsers
  operators.ts                   — ParserOperators namespace: postfix-style operator helpers
  parzing.ts                     — Public entry point; re-exports from core, builder, operators, WhitespaceParser
  parsers/
    TokenParser.ts               — Matches an exact string token
    AnyOfParser.ts               — Matches characters from a set (bitmap-optimised for ASCII)
    RegexParser.ts               — Matches a RegExp at the current position
    WhitespaceParser.ts          — Matches space/tab/newline; optional or mandatory mode
  combinators/
    SequenceCombinator.ts        — Runs parsers in order; collects non-void results into a typed tuple
    ChooseCombinator.ts          — Tries alternatives left-to-right with backtracking
    ManyCombinator.ts            — Zero-or-more (or bounded) repetition with optional separator
    OptionalCombinator.ts        — Returns null instead of failing
    MapParser.ts                 — Transforms a parser's result with a mapping function
    AstBuilder.ts                — Spreads a sequence result into a constructor call
    AttemptParser.ts             — Wraps a parser and swallows any cut signal
    ParserWithIndices.ts         — Wraps a parser and returns start/length source offsets
dist/                            — Compiled JS + .d.ts output (generated; do not edit)
test/
  parsers.test.ts                — Unit tests for primitive parsers
  combinators.test.ts            — Unit tests for all combinators
  language.test.ts               — Integration test: a small toy language grammar
docs/
  architecture.md                — Architectural overview (keep this up to date)
```

## Build

```bash
npm run build          # tsc && npm pack — compiles src/ → dist/ and creates a .tgz
```

TypeScript config: `tsconfig.json` targets ES2019, CommonJS modules, outputs declarations.

The compiled output lives in `dist/`. The npm package ships only the `dist/` directory.

## Testing

```bash
npm test               # ts-mocha test/**.ts
```

Tests run directly against the TypeScript sources via `ts-mocha` (no separate compile step needed). The test runner is **Mocha**; assertions use Node's built-in `assert` module.

- `parsers.test.ts` — covers `TokenParser`, `AnyOfParser`, `RegexParser` in isolation
- `combinators.test.ts` — covers `SequenceCombinator`, `ChooseCombinator`, `ManyCombinator`, `OptionalCombinator` and cut behaviour
- `language.test.ts` — end-to-end test that builds a complete toy language grammar using `ParserBuilder` and `ParserOperators`

Always run tests after making changes to `src/`.

## Code Conventions

- **TypeScript strict-ish**: no explicit `strict` flag, but types are used throughout. Avoid `any` except when bridging typed tuples in combinators (where the TypeScript type machinery requires it).
- **Naming**: `PascalCase` for classes, `camelCase` for functions/methods/variables, `_camelCase` for private fields.
- **Private fields**: use the `private _fieldName` TypeScript convention, not `#` native private fields.
- **No runtime dependencies**: keep it that way. Dev dependencies only.
- **No comments by default**: only add a comment when the _why_ is non-obvious (e.g. the `cutEncountered` save/restore dance, or the bitmap optimisation in `AnyOfParser`).
- **Void results in sequences**: `SequenceCombinator` and `MapParser.omit` rely on `undefined` results being filtered from the output tuple. The `FilterVoid` type in `SequenceCombinator.ts` enforces this at the type level.

## Key Patterns

### Adding a new primitive parser
1. Create `src/parsers/YourParser.ts` implementing `Parser<T>`.
2. Add a factory method to `ParserBuilder` in `src/builder.ts`.
3. Export from `src/parzing.ts` if it is public API.
4. Add tests in `test/parsers.test.ts`.

### Adding a new combinator
1. Create `src/combinators/YourCombinator.ts` implementing `Parser<T>` (or extending `ParserWithInternalWhitespaceSupport<T>` if whitespace skipping is needed).
2. Add a factory method to `ParserBuilder`.
3. Handle the `cutEncountered` flag correctly if the combinator can backtrack (see `OptionalCombinator` / `ManyCombinator` for the pattern).
4. Add tests in `test/combinators.test.ts`.

### Adding a new operator
1. Add a function to the `ParserOperators` namespace in `src/operators.ts`.
2. It should return a function `(p: Parser<S>) => Parser<T>`.

## Cut Protocol (important invariant)

Any combinator that may backtrack **must** follow this protocol around `parserContext.cutEncountered`:

1. Save the current flag value.
2. Set it to `false`.
3. Invoke the underlying parser.
4. If the underlying parser fails **and** `cutEncountered` is `true`, propagate the failure without backtracking.
5. Restore the saved value before returning.

Violating this protocol causes subtle grammar bugs where cuts in sub-parsers are silently ignored.

## Breaking API Changes

Any change that breaks backward compatibility for consumers of this library — including removing or renaming exported symbols, changing method signatures, altering parse result types, or modifying observable runtime behaviour — **must** be handled as follows:

1. **Flag it explicitly**: Before implementing, state clearly that the change is a breaking API change and describe the impact on existing callers.
2. **Request explicit approval**: Do not proceed with the change until the user has confirmed they want to break compatibility.
3. **Bump the major version**: Once approved, increment the major version in `package.json` (e.g. `1.x.y` → `2.0.0`) as part of the same change.

This applies to changes in `src/core.ts`, `src/builder.ts`, `src/operators.ts`, `src/parzing.ts`, and any public-facing parser or combinator interface.

## Architecture Documentation

See [`docs/architecture.md`](docs/architecture.md) for the overall design and module relationships. **Keep this file updated** whenever structural changes are made to `src/`.
