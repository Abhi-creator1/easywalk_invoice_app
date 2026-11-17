// IndexedDB storage for the web build.
//
// Mirrors the collections the desktop build keeps as JSON files in
// electron/store.js, but writes one record per transaction instead of
// rewriting a whole file. That removes the desktop failure mode where a
// half-written or corrupt JSON file silently read back as empty and the next
// save then overwrote the real data with it.
//
// Everything above this layer goes through js/platform/api.web.js, so swapping
// this for a cloud-backed store later means touching only these two files.
const IDB_NAME = "easywalk";
const IDB_VERSION = 1;

const IDB_SCHEMA = {
  invoices: { keyPath: "invoiceNumber", indexes: [] },
  documents: { keyPath: "docNumber", indexes: [{ name: "docType", keyPath: "docType" }] },
  patients: { keyPath: "id", indexes: [] },
  meta: { keyPath: "key", indexes: [] }
};

let idbPromise = null;

function openIdb() {
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("This browser has no IndexedDB, so data cannot be saved."));
      return;
    }

    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      Object.entries(IDB_SCHEMA).forEach(([name, spec]) => {
        const store = db.objectStoreNames.contains(name)
          ? request.transaction.objectStore(name)
          : db.createObjectStore(name, { keyPath: spec.keyPath });

        spec.indexes.forEach(index => {
          if (!store.indexNames.contains(index.name)) {
            store.createIndex(index.name, index.keyPath);
          }
        });
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the local database."));
    request.onblocked = () => reject(new Error("Another tab is holding the database open. Close it and retry."));
  });

  return idbPromise;
}

function awaitRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs `work(tx)` inside one transaction and resolves with whatever `work`
// returns, but only once the transaction has actually committed.
function transact(storeNames, mode, work) {
  return openIdb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let outcome;

    tx.oncomplete = () => resolve(outcome);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("The save was rolled back."));

    Promise.resolve(work(tx))
      .then(value => { outcome = value; })
      .catch(err => {
        try { tx.abort(); } catch (ignored) { /* already aborting */ }
        reject(err);
      });
  }));
}

const store = {
  async readAll(collection) {
    return transact([collection], "readonly", tx =>
      awaitRequest(tx.objectStore(collection).getAll()));
  },

  async get(collection, key) {
    if (key === undefined || key === null || key === "") return null;
    const found = await transact([collection], "readonly", tx =>
      awaitRequest(tx.objectStore(collection).get(key)));
    return found === undefined ? null : found;
  },

  async put(collection, record) {
    return transact([collection], "readwrite", async tx => {
      await awaitRequest(tx.objectStore(collection).put(record));
      return record;
    });
  },

  async remove(collection, key) {
    return transact([collection], "readwrite", async tx => {
      await awaitRequest(tx.objectStore(collection).delete(key));
      return true;
    });
  },

  async byIndex(collection, indexName, value) {
    return transact([collection], "readonly", tx =>
      awaitRequest(tx.objectStore(collection).index(indexName).getAll(value)));
  },

  async replaceAll(collection, records) {
    return transact([collection], "readwrite", async tx => {
      const objectStore = tx.objectStore(collection);
      await awaitRequest(objectStore.clear());
      for (const record of records) {
        await awaitRequest(objectStore.put(record));
      }
      return records.length;
    });
  },

  // `meta` holds the two singletons the desktop build keeps as their own files:
  // the per-month document counters and the app settings.
  meta: {
    async get(key, fallback) {
      const row = await store.get("meta", key);
      return row && row.value !== undefined ? row.value : fallback;
    },

    async set(key, value) {
      await store.put("meta", { key, value });
      return value;
    },

    // Read-modify-write inside a single transaction, so two quick saves can
    // never mint the same document number.
    async update(key, fallback, mutate) {
      return transact(["meta"], "readwrite", async tx => {
        const objectStore = tx.objectStore("meta");
        const row = await awaitRequest(objectStore.get(key));
        const current = row && row.value !== undefined ? row.value : fallback;
        const { value, result } = mutate(current);
        await awaitRequest(objectStore.put({ key, value }));
        return result;
      });
    }
  },

  async counts() {
    const [invoices, documents, patients] = await Promise.all([
      store.readAll("invoices"),
      store.readAll("documents"),
      store.readAll("patients")
    ]);
    return {
      invoices: invoices.length,
      documents: documents.length,
      patients: patients.length
    };
  }
};
