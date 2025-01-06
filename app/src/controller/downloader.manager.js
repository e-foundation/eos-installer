const DB_NAME = "MurenaBlobStore";
const DB_VERSION = 1;

import ky from 'ky';
import {ZipReader, BlobReader, BlobWriter} from "@zip.js/zip.js";
import { WDebug } from "../debug.js";

/**
 * Download Manager
 * Download files from the device folder of [modelname].json
 * Download with DBStore and unzip if necessary
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
        let current_file ;
        try {
            for (let i = 0; i < folder.length; i++) {
                const file = folder[i];
                current_file = file.path;
                if(filesRequired.includes(file.name) || file.unzip){
                    const blob = await this.download(file.path, (value, total) => {
                        onDownloadProgress(value, total, file.name);
                    });
                    if(file.unzip){
                        const zipReader = new ZipReader(new BlobReader(blob));
                        const filesEntries = await zipReader.getEntries();
                        for(let i= 0 ; i < filesEntries.length; i++) {
                            const unzippedEntry = await this.getFileFromZip(filesEntries[i], (value, total) => {
                                    onUnzipProgress(value, total, filesEntries[i].filename);
                            });
                            let filename = this.getMappedName(filesEntries[i].filename, file.mapping);
                            if(filesRequired.includes(filename)){
                                await this.setInDBStore(unzippedEntry.blob, filename);
                                this.stored[filename] = true;
                            }
                        }
                        await zipReader.close();
    
                    } else {
                        await this.setInDBStore(blob, file.name);
                        this.stored[file.name] = true;
                    }
                }
            }
        } catch (e) {
            throw new Error(`downloadAndUnzipFolder Error <br/>current_file ${current_file} <br/> ${e.message || e}`);
        }
    }

    async getFileFromZip(file, onProgress) {
        const name = file.filename;
        const blob = await file.getData(new BlobWriter(), {
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

    getMappedName(filename, map) {
        if (!map) {
            return filename;
        }

        console.log(map);
        for (const [regex, newFilename] of Object.entries(map)) {
            let re = new RegExp(regex);
            if (filename.match(re)) {
                return newFilename;
            }
        }
        return filename;
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
            throw new Error(`File ${name} was not previously downloaded`)
        }
        return await this.getFromDBStore(name);
    }

    /*
    * getData from a zip file
    * */
    async getData(dbFile, fileEntry, onProgress) {
        const _zip = new BlobWriter();
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
            throw new Error(`${e.message || e}`);
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

    async getContentLength(url) {
        const response = await ky.head(url)
        const contentLength = response.headers.get("content-length");
        return parseInt(contentLength, 10);
    }

    async fetch({url, chunkSize}, onProgress) {
        try {
            const contentLength = await this.getContentLength(url);
            const totalChunks = Math.ceil(contentLength / chunkSize);
            const buffers = [];
    
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize - 1, contentLength - 1);
                try {
                    const response = await ky.get(url, {
                        headers: {
                            'Range': `bytes=${start}-${end}`
                        }
                    });
                    if (!response.ok) {
                        throw new Error(`Cannot download chunk (1) ${i + 1}: ${response.status} ${response.statusText}`);
                    }
    
                    const chunk = await response.arrayBuffer();
                    buffers.push(chunk);
                    onProgress(start + chunk.byteLength, contentLength);
    
                } catch (chunkError) {
                    throw new Error(`Cannot download chunk (2) ${i + 1} ${chunkError.message || chunkError}`);
                }
            }
            return buffers;
    
        } catch (error) {
            throw new Error(`Download fails ${error.message || error}`);
        }
    }
    

}
