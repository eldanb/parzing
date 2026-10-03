import { ParseError, ParseResult } from "../core";

export class RecoveryErrors {
  private _first: ParseError | null = null;
  private _all: ParseError[] = [];

  add(first: ParseError, all: ParseError[] = [first]) {
    this._first = this._first || first;
    this._all.push(...all);
  }

  result<T>(value: T): ParseResult<T> {
    return this._first
      ? ParseResult.failed(this._first, { result: value, errors: this._all })
      : ParseResult.successful(value);
  }
}
