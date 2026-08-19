// 最小 localStorage polyfill：node 环境下 zustand persist 在导入时会访问
// localStorage，提供内存实现避免测试崩溃（无需引入 jsdom）。
class MemoryStorage {
  constructor() {
    this.store = {}
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null
  }
  setItem(key, value) {
    this.store[key] = String(value)
  }
  removeItem(key) {
    delete this.store[key]
  }
  clear() {
    this.store = {}
  }
}

globalThis.localStorage = new MemoryStorage()
// 部分库（如 zustand persist）会检查 window.localStorage，提供 window 指向 globalThis 以静默持久化告警。
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}
