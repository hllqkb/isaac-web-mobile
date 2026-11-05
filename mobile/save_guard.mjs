// A queued file remains recoverable until IndexedDB confirms the transaction.
export function createSaveWriter({database, queue, store}) {
  let active = null, inFlight = 0, committed = 0, lastError = '';
  async function drain() {
    while (queue.length) {
      const db = database();
      if (!db) throw new Error('存档数据库尚未就绪');
      const batch = queue.splice(0);
      inFlight = batch.length;
      try {
        await new Promise((resolve, reject) => {
          let tx;
          try {
            tx = db.transaction(store, 'readwrite');
            tx.oncomplete = resolve;
            tx.onabort = () => reject(tx.error || new Error('存档事务已取消'));
            tx.onerror = () => {}; // onabort settles the failed transaction.
            const files = tx.objectStore(store);
            for (const file of batch) {
              if (file.bytes) files.put({src:file.src, bytes:file.bytes}, file.key);
              else files.delete(file.key);
            }
          } catch (error) {
            try {tx?.abort();} catch {}
            reject(error);
          }
        });
        committed += batch.length;
        lastError = '';
      } catch (error) {
        const latest = new Map([...batch,...queue].map(file => [file.key,file]));
        queue.splice(0,queue.length,...latest.values());
        lastError = String(error.message || error);
        throw error;
      } finally { inFlight = 0; }
    }
  }
  function flush() {
    if (!active) active = drain().finally(() => {active = null;});
    return active;
  }
  return {flush, stats:() => ({committed,inFlight,pending:queue.length,lastError})};
}
