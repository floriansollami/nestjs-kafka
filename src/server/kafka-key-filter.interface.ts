export interface KeyFilter<T = unknown> {
  matches(deserializedKey: T): boolean;
}

export type KeyFilterFunction<T = unknown> = KeyFilter<T>['matches'];
