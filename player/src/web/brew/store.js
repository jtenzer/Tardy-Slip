const DB = "hallpass-phone";
const FILES = "files";
function open()                       {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(FILES, { keyPath: "path" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB is not available"));
  });
}
function run   (mode                    , f                                             )                         {
  return open().then((db) =>
    new Promise               ((resolve, reject) => {
      const tx = db.transaction(FILES, mode);
      const req = f(tx.objectStore(FILES));
      tx.oncomplete = () => {
        db.close();
        resolve(req ? req.result : undefined);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      };
    })
  );
}
export async function loadFiles()                    {
  try {
    return ((await run          ("readonly", (s) => s.getAll())) ?? []).filter((f) => f && typeof f.path === "string" && f.data instanceof Uint8Array);
  } catch {
    return [];
  }
}
export async function saveFiles(files          )                {
  await run("readwrite", (s) => {
    for (const f of files) s.put({ path: f.path, data: f.data });
  });
  await navigator.storage?.persist?.().catch(() => false);
}
export async function clearFiles()                {
  await run("readwrite", (s) => void s.clear());
}
