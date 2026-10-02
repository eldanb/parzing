import { Parser } from "./core";

export const parserExtensionsKey: unique symbol = Symbol("parserExtensions");
const rawTargetKey = Symbol("rawTarget");

export interface ParserExtensionSupport<E> {
  _<Self, R>(this: Self, f: (target: Self) => R): Extend<Self, R>;
  // Phantom: lets `_` and extension methods recover the extension set from the type of `this`.
  readonly [parserExtensionsKey]?: E;
}

export type ExtendedParser<P, E> = P & E & ParserExtensionSupport<E>;

export type Extend<Self, R> = Self extends {
  readonly [parserExtensionsKey]?: infer E;
}
  ? ExtendedParser<R, E>
  : R;

export type ExtensibleParser<T = any, C = any, E = unknown> = Parser<T, C> &
  ParserExtensionSupport<E>;

export type ParserOperator = (
  this: ExtensibleParser<any, any, any>,
  ...args: any[]
) => Parser<any, any>;

export type ParserExtension<X = Record<string, unknown>> = {
  [K in keyof X]: ParserOperator;
};

export function applyExtensions<P, E extends object>(
  parser: P,
  extensions: E,
): ExtendedParser<P, E> {
  if (typeof parser !== "object" || parser === null) {
    return parser as ExtendedParser<P, E>;
  }

  const target: object = (parser as any)[rawTargetKey] ?? parser;
  const boundMethods = new Map<Function, Function>();

  // Target methods run against the raw target so field access inside hot
  // parse() paths doesn't go through the proxy; `return this` is mapped back
  // to the proxy so chaining keeps the extensions.
  const proxy: object = new Proxy(target, {
    get(t, prop) {
      if (prop === rawTargetKey) {
        return t;
      }

      if (prop === "_") {
        return (f: (target: unknown) => unknown) =>
          applyExtensions(f(proxy), extensions);
      }

      if (prop in t) {
        const value = Reflect.get(t, prop);
        if (typeof value !== "function") {
          return value;
        }

        let bound = boundMethods.get(value);
        if (!bound) {
          bound = (...args: unknown[]) => {
            const result = value.apply(t, args);
            return result === t ? proxy : result;
          };
          boundMethods.set(value, bound);
        }
        return bound;
      }

      if (prop in extensions) {
        const impl = (extensions as any)[prop];
        if (typeof impl !== "function") {
          return impl;
        }

        return (...args: unknown[]) =>
          applyExtensions(impl.apply(proxy, args), extensions);
      }

      return undefined;
    },

    has(t, prop) {
      return prop === "_" || prop in t || prop in extensions;
    },
  });

  return proxy as ExtendedParser<P, E>;
}
