const DB_NAME = "BlobStore";
const DB_VERSION = 1;

import { WDebug } from "../debug.js";

/**
 * Download Manager
 * Download files from the device folder of [modelname].json
 * Download with DBStore and unizip if necessary
 * Blobs are in this.files[filename]
 */
export class Downloader {
    constructor() {
        this.db = null;
        this.stored = {};
    }

    async init() {
        if (this.db) return;  // Already initialized

        this.db = await this.openDBStore();
        await this.clearDBStore();
        this.quota = await navigator.storage.estimate();
    }

    /*
    * */
    async downloadAndUnzipFolder(filesRequired, folder, onDownloadProgress, onUnzipProgress) {
        for (let i = 0; i < folder.length; i++) {
            const file = folder[i];
            if(filesRequired.includes(file.name) || file.unzip){
                const blob = await this.download(file.path, (value, total) => {
                    onDownloadProgress(value, total, file.name);
                });
                if(file.unzip){
                    const zipReader = new zip.ZipReader(new zip.BlobReader(blob));
                    const filesEntries = await zipReader.getEntries();
                    for(let i= 0 ; i < filesEntries.length; i++) {
                        if(filesRequired.includes(filesEntries[i].filename)){
                            const unzippedEntry = await this.getFileFromZip(filesEntries[i], (value, total) => {
                                onUnzipProgress(value, total, filesEntries[i].filename);
                            });
                            await this.setInDBStore(unzippedEntry.blob, filesEntries[i].filename);
                            this.stored[filesEntries[i].filename] = true;
                        }
                    }
                    await zipReader.close();

                } else {
                    await this.setInDBStore(blob, file.name);
                    this.stored[file.name] = true;
                }
            }
        }
    }

    async getFileFromZip(file, onProgress) {
        const name = file.filename;
        const blob = await file.getData(new zip.BlobWriter(), {
            onprogress: (value, total) => {
                onProgress(value, total, name);
            },
            useWebWorkers: false,
        });
        return {
            name,
            blob
        }
    }


    /**
     * @param name
     * @returns {<blob>}
     *  It does not launch download <!> (downloads are launched with downloadFolder)
     * this function retrieve the promise linked to the fileName
     */
    async getFile(name) {
        const file = this.stored[name];
        if(!file){
            throw Error(`File ${name} was not previously downloaded`)
        }
        return await this.getFromDBStore(name);
    }

    /*
    * getData from a zip file
    * */
    async getData(dbFile, fileEntry, onProgress) {
        const _zip = new zip.BlobWriter();
        const blob = await fileEntry.getData(_zip, {
            onprogress: (value, total) => {
                onProgress(value, total, dbFile);
            },
            onend: () => {},
            useWebWorkers: true,
        });
        return blob;
    }

    async download(path, onProgress) {
        try {
            const buffers = await this.fetch({
                url: path,
                chunkSize: 16 * 1024 * 1024,
                poolLimit: 1,
            }, onProgress);

            //let totalSize = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
            const ret = new Blob(buffers);
            return ret;
        } catch (e) {
            WDebug.log(`Erreur: ${e.message}`);
            console.error(e); //K1ZFP TODO
            throw Error(e);
        }
    }

    async clearDBStore() {
        const store = this.db.transaction(DB_NAME, "readwrite").objectStore(DB_NAME);
        store.clear();
    }

    async setInDBStore(blob, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(DB_NAME, 'readwrite');
            const store = transaction.objectStore(DB_NAME);
            const request = store.put(blob, key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getFromDBStore(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(DB_NAME, 'readonly');
            const store = transaction.objectStore(DB_NAME);
            const request = store.get(key);
            request.onsuccess = function (event) {
                const result = event.target.result;
                if (result) {
                    resolve(result);
                } else {
                    resolve(null);
                }
            };
            request.onerror = function (event) {
                reject(event.target.error);
            };
        });
    }

    async openDBStore() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = reject;
            request.onupgradeneeded = function (event) {
                const db = event.target.result;
                db.createObjectStore(DB_NAME, {autoIncrement: false});
            };
            request.onsuccess = function (event) {
                resolve(event.target.result);
            }
        });
    }


    concatenate(arrays) {
        if (!arrays.length) return null;
        let totalLength = arrays.reduce((acc, value) => acc + value.length, 0);
        let result = new Uint8Array(totalLength);
        let length = 0;
        for (let array of arrays) {
            result.set(array, length);
            length += array.length;
        }
        return result;
    }

    getContentLength(url) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open("HEAD", url);
            xhr.send();
            xhr.onload = function () {
                resolve(
                    // xhr.getResponseHeader("Accept-Ranges") === "bytes" &&
                    ~~xhr.getResponseHeader("Content-Length")
                );
            };
            xhr.onerror = reject;
        });
    }

    async fetch({url, chunkSize}, onProgress) {
        const contentLength = await this.getContentLength(url);
        const totalChunks = Math.ceil(contentLength / chunkSize);

        const buffers = [];

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize - 1, contentLength - 1);

            const chunk = await fetch(url, {
                headers: {
                    'Range': `bytes=${start}-${end}`
                }
            }).then(res => res.arrayBuffer());

            buffers.push(chunk);
            onProgress(start + chunk.byteLength, contentLength);
         }

        return buffers;
    }

}