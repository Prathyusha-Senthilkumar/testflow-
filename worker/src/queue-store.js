const fs = require('node:fs');
const path = require('node:path');

const LOCK_RETRIES = 100;
const LOCK_RETRY_MS = 20;

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait for short lock retries
  }
}

function normalizeJob(job) {
  if (!job || !job.execution_id) {
    return null;
  }
  return {
    execution_id: job.execution_id,
    test_case_id: job.test_case_id,
    auth_profile_id: job.auth_profile_id ?? null,
  };
}

class QueueStore {
  constructor({ executionStorePath, queuePath, resultPath }) {
    this.executionStorePath = executionStorePath;
    this.queuePath = queuePath;
    this.resultPath = resultPath;
    this.lockPath = queuePath.endsWith('.json')
      ? queuePath.replace(/\.json$/, '.lock')
      : `${queuePath}.lock`;
    this.queue = this._readJson(this.queuePath, []);
  }

  _readJson(filePath, fallback) {
    if (!filePath) return fallback;
    try {
      if (!fs.existsSync(filePath)) {
        return fallback;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  _writeJson(filePath, payload) {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  _withLockSync(fn) {
    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      try {
        fs.writeFileSync(this.lockPath, String(process.pid), { flag: 'wx' });
        try {
          return fn();
        } finally {
          fs.rmSync(this.lockPath, { force: true });
        }
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
        sleepSync(LOCK_RETRY_MS);
      }
    }
    throw new Error('Could not acquire queue lock');
  }

  async _withLock(fn) {
    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      try {
        fs.writeFileSync(this.lockPath, String(process.pid), { flag: 'wx' });
        try {
          return await fn();
        } finally {
          fs.rmSync(this.lockPath, { force: true });
        }
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
    throw new Error('Could not acquire queue lock');
  }

  listQueued() {
    const queue = this._readJson(this.queuePath, []);
    if (!Array.isArray(queue)) {
      return [];
    }
    return queue.map(normalizeJob).filter(Boolean);
  }

  enqueue(job) {
    const normalized = normalizeJob(job);
    if (!normalized) {
      throw new Error('Invalid queue job');
    }
    return this._withLockSync(() => {
      const queue = this._readJson(this.queuePath, []);
      const nextQueue = Array.isArray(queue) ? queue : [];
      nextQueue.push(normalized);
      this.queue = nextQueue;
      this._writeJson(this.queuePath, nextQueue);
      return normalized;
    });
  }

  async claimNext() {
    return this._withLock(() => {
      const queue = this._readJson(this.queuePath, []);
      if (!Array.isArray(queue) || queue.length === 0) {
        this.queue = [];
        return null;
      }
      const job = normalizeJob(queue[0]);
      const remaining = queue.slice(1).map(normalizeJob).filter(Boolean);
      this.queue = remaining;
      this._writeJson(this.queuePath, remaining);
      if (!job) {
        return null;
      }
      this.markRunning(job.execution_id);
      return job;
    });
  }

  /** @deprecated Use claimNext() */
  next() {
    const queue = this._readJson(this.queuePath, []);
    if (!Array.isArray(queue) || queue.length === 0) {
      return null;
    }
    const job = normalizeJob(queue[0]);
    const remaining = queue.slice(1).map(normalizeJob).filter(Boolean);
    this.queue = remaining;
    this._writeJson(this.queuePath, remaining);
    return job;
  }

  markRunning(executionId) {
    const store = this._readJson(this.executionStorePath, {});
    if (store[executionId]) {
      store[executionId].status = 'RUNNING';
      store[executionId].updated_at = new Date().toISOString();
      this._writeJson(this.executionStorePath, store);
    }
    return store[executionId];
  }

  markResult(executionId, result) {
    const store = this._readJson(this.executionStorePath, {});
    if (store[executionId]) {
      store[executionId].status = result.status;
      store[executionId].updated_at = result.completed_at || new Date().toISOString();
      this._writeJson(this.executionStorePath, store);
    }
    const results = this._readJson(this.resultPath, {});
    results[executionId] = result;
    this._writeJson(this.resultPath, results);
    return result;
  }
}

module.exports = { QueueStore, normalizeJob };
