export class AsyncMutex {
  #locked = false;
  readonly #waiters: Array<() => void> = [];

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const enter = (): void => {
        this.#locked = true;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          const next = this.#waiters.shift();
          if (next) next();
          else this.#locked = false;
        });
      };
      if (this.#locked) this.#waiters.push(enter);
      else enter();
    });
  }
}
