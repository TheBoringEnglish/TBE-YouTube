/**
 * 带有批处理、并发控制和自动重试的任务队列
 */
const queues = new Map();

class BatchQueue {
  constructor(handler, options) {
    this.handler = handler;
    this.options = {
      batchInterval: 800, // 增加间隔以降低 API 压力
      batchSize: 8,       // 缩小每批大小
      maxRetries: 3,      // 最大重试次数
      ...options,
    };
    this.queue = [];
    this.timer = null;
    this.processing = false;
  }

  async addTask(data, args) {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, args, resolve, reject, retryCount: 0 });
      this._checkQueue();
    });
  }

  _checkQueue() {
    if (this.timer || this.processing) return;

    if (this.queue.length >= this.options.batchSize) {
      this._process();
    } else if (this.queue.length > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this._process();
      }, this.options.batchInterval);
    }
  }

  async _process() {
    if (this.queue.length === 0 || this.processing) return;
    this.processing = true;

    const batch = this.queue.splice(0, this.options.batchSize);
    const texts = batch.map((item) => item.data);
    const args = batch[0].args;

    try {
      const results = await this._executeWithRetry(texts, args);
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (err) {
      batch.forEach((item) => item.reject(err));
    } finally {
      this.processing = false;
      this._checkQueue();
    }
  }

  async _executeWithRetry(texts, args, currentRetry = 0) {
    try {
      return await this.handler(texts, args);
    } catch (err) {
      if (currentRetry < this.options.maxRetries) {
        // 指数退避重试
        const delay = Math.pow(2, currentRetry) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._executeWithRetry(texts, args, currentRetry + 1);
      }
      throw err;
    }
  }

  clear() {
    this.queue = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export function getBatchQueue(key, handler, options = {}) {
  if (!queues.has(key)) {
    queues.set(key, new BatchQueue(handler, options));
  }
  return queues.get(key);
}
