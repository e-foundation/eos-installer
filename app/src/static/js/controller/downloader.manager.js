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
                    await this.setInDBStore(blob,file.name);
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
                chunkSize: 15 * 1024 * 1024,
                poolLimit: 6,
            }, onProgress)
            return new Blob([buffers]);
        } catch (e) {
            console.error(e); //K1ZFP TODO
            throw Error(e);
        }
    }


    async removeFile(filename) {
        try {
            await this.removeFromDBStore(filename);
            delete this.stored[filename];
        } catch (e) {
            return false;
        }
        return true;
    }

    async clearDBStore() {
        WDebug.log('DownloaderManager store.clear')
        const store = this.db.transaction(DB_NAME, "readwrite").objectStore(DB_NAME);
        store.clear();
    }
    async removeFromDBStore(key) {
        const store = this.db.transaction(DB_NAME, "readwrite").objectStore(DB_NAME);
        return store.delete(path);
    }


    async setInDBStore(blob, name) {
        WDebug.log('DownloaderManager store',blob,  name )
        const store = this.db.transaction(DB_NAME, "readwrite").objectStore(DB_NAME);
        store.put(blob, name);
    }

    getFromDBStore(key) {
        WDebug.log('DownloaderManager getFromstore', key )
        return new Promise((resolve, reject) => {
            const store = this.db.transaction(DB_NAME, 'readonly').objectStore(DB_NAME);
            const request = store.get(key);
            request.onsuccess = function (event) {
                const result = event.target.result;
                WDebug.log('DownloaderManager result', result)
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
                /*const store: IDBObjectStore = */
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

    getBinaryContent(url, start, end, i, onprogress) {
        return new Promise((resolve, reject) => {
            try {
                let xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.setRequestHeader("range", `bytes=${start}-${end}`); // Set range request information
                xhr.responseType = "arraybuffer"; // Set the returned type to arraybuffer
                xhr.onload = function () {
                    resolve({
                        index: i, // file block index
                        buffer: xhr.response,
                    });
                };
                xhr.onprogress = onprogress;
                xhr.send();
            } catch (err) {
                reject(new Error(err));
            }
        });
    }

    saveAs({name, buffers, mime = "application/octet-stream"}) {
        const blob = new Blob([buffers], {type: mime});
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = name || Math.random();
        a.href = blobUrl;
        a.click();
        URL.revokeObjectURL(blob);
    }

    async asyncPool(concurrency, iterable, iteratorFn) {
        const ret = []; // Store all asynchronous tasks
        const executing = new Set(); // Stores executing asynchronous tasks
        for (const item of iterable) {
            // Call the iteratorFn function to create an asynchronous task
            const p = Promise.resolve().then(() => iteratorFn(item, iterable));

            ret.push(p); // save new async task
            executing.add(p); // Save an executing asynchronous task

            const clean = () => executing.delete(p);
            p.then(clean).catch(clean);
            if (executing.size >= concurrency) {
                // Wait for faster task execution to complete
                await Promise.race(executing);
            }
        }
        return Promise.all(ret);
    }

    async fetch({url, chunkSize, poolLimit = 1}, onProgress) {
        const contentLength = await this.getContentLength(url);
        const chunks =
            typeof chunkSize === "number" ? Math.ceil(contentLength / chunkSize) : 1;
        const totalByChunks = new Array(chunks).fill(0);
        const results = await this.asyncPool(
            poolLimit,
            [...new Array(chunks).keys()],
            (i) => {
                let start = i * chunkSize;
                let end = i + 1 == chunks ? contentLength - 1 : (i + 1) * chunkSize - 1;
                return this.getBinaryContent(url, start, end, i, (e) => {
                    totalByChunks[i] = e.loaded;
                    const sum = totalByChunks.reduce((partialSum, a) => partialSum + a, 0)
                    onProgress(sum, contentLength);
                });
            }
        );
        const sortedBuffers = results
            .map((item) => new Uint8Array(item.buffer));
        return this.concatenate(sortedBuffers);
    }

}
