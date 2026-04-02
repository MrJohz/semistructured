/**
 * An iterable weak set
 *
 * Based on the TC39 `IterableWeakMap` class here: https://github.com/tc39/proposal-weakrefs?tab=readme-ov-file#iterable-weakmaps
 */
export class IterableWeakSet<T extends WeakKey> {
  #weakMap = new WeakMap<T, { entry: T; ref: WeakRef<T> }>();
  #refSet = new Set<WeakRef<T>>();
  #finalizationGroup = new FinalizationRegistry(IterableWeakSet.#cleanup);

  static #cleanup(payload: { set: Set<WeakRef<any>>; ref: WeakRef<any> }) {
    payload.set.delete(payload.ref);
  }

  add(entry: T) {
    const ref = new WeakRef(entry);

    this.#weakMap.set(entry, { entry, ref });
    this.#refSet.add(ref);
    this.#finalizationGroup.register(entry, { set: this.#refSet, ref }, ref);
  }

  has(entry: T) {
    return this.#weakMap.has(entry);
  }

  delete(entry: T) {
    const payload = this.#weakMap.get(entry);
    if (!payload) return false;

    this.#weakMap.delete(entry);
    this.#refSet.delete(payload.ref);
    this.#finalizationGroup.unregister(payload.ref);
    return true;
  }

  get empty() {
    for (const ref of this.#refSet) {
      if (ref.deref()) return false;
    }
    return true;
  }

  *[Symbol.iterator]() {
    for (const ref of this.#refSet) {
      const entry = ref.deref();
      if (!entry) continue;
      yield entry;
    }
  }

  *entries() {
    for (const entry of this) yield [entry, entry];
  }

  keys() {
    return this[Symbol.iterator]();
  }

  values() {
    return this[Symbol.iterator]();
  }
}
