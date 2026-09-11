const DATABASE_NAME = 'match-pulse-settings';
const STORE_NAME = 'preferences';
const AUDIO_KEY = 'alert-audio';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export function loadSavedAudio() {
  return useStore('readonly', (store) => store.get(AUDIO_KEY));
}

export function saveAudio(file) {
  return useStore('readwrite', (store) => store.put({
    name: file.name,
    type: file.type,
    blob: file,
    savedAt: new Date().toISOString(),
  }, AUDIO_KEY));
}
