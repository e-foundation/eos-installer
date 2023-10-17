const DB_NAME = "BlobStore";
const DB_VERSION = 1;

/**
 * Download Manager
 * Download files from the device folder of [modelname].json
 * Download with DBStore and unizip if necessary
 * Blobs are in this.files[filename]
 */
export class Downloader {
    constructor() {
        this.db = null;
        this.files = {};
        this.unzipping = {};
        this.folder = {};
    }

    async init() {
        //this.quota = await navigator.storage.estimate();
    }

    /*
    * download the files of folder set in resources
    * set this.files[fileName] = promise<file downloading>
    * if it needs unzip we also do this.unZip
    * */
    async downloadFolder(folder, onDownloadProgress, onUnzipProgress, filesName) {
        for (let i = 0; i < folder.length; i++) {
            const file = folder[i];
            this.files[file.name] = this.get(file.path, (value, total) => {
                onDownloadProgress(value, total, file.name);
            });
            if (file.unzip) {
                this.unzipping[file.name] = this.unZip(file.name, onUnzipProgress, filesName);
                this.unzipping[file.name].then(() => {
                    delete this.unzipping[file.name];
                }).catch((e) => {
                    console.error(e);
                })
            }
        }
    }


    /**
     *
     * @param file : string
     * @param onProgress : function
     * @returns {Promise<Awaited<unknown>[]>}
     * wait for the folder this.files[fileName] to download
     * retrieve the entries of the unzipped folder
     * for each entry, set this.files[fileName] = promise<file get blob>
     */
    async unZip(name, onProgress) {
        const downloading = this.getFile(name);
        const all = [];
        if (downloading) {
            const blob = await downloading;
            if (blob) {
                const zipReader = new zip.ZipReader(new zip.BlobReader(blob));
                const files = await zipReader.getEntries();
                for (var i = 0; i < files.length; i++) {
                    const path = files[i].filename;
                    all.push(new Promise(async (resolve, reject) => {
                        this.files[path] = await files[i].getData(new zip.BlobWriter(), {
                            onprogress: (value, total) => {
                                onProgress(value, total, path);
                            },
                            onend: () => {
                                console.log('end')
                            },
                            useWebWorkers: false,
                        });
                        resolve(this.files[path]);
                    }))
                }
                const res = await Promise.all(all);
                await zipReader.close();
                return res;
            } else {
                throw Error('something went wrong on folder file download');
            }
        } else {
            throw Error('file not downloaded');
        }
    }


    /**
     * @param name
     * @returns {Promise<blob|boolean>}
     *  It does not launch download <!> (downloads are launched with downloadFolder)
     * this function retrieve the promise linked to the fileName
     */
    async getFile(name) {
        if (this.files[name]) {
            return this.files[name];
        } else {
            const unzipping = Object.values(this.unzipping);
            if (unzipping.length) { //unzipping in Process, maybe our file is in it
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log(`waiting unzip of  ${name}`);
                return await this.getFile(name);
            } else {
                return false;
            }
        }
    }

    /*
    * getData from a zip file
    * */
    async getData(dbFile, fileEntry, onProgress) {
        return new Promise(async (resolve, reject) => {
            const db = await this.openDBStore();
            const file = await this.getDBStore(db, dbFile);
            if (file) {
                resolve(file.content);
            } else {
                const _zip = new zip.BlobWriter();
                const blob = await fileEntry.getData(_zip, {
                    onprogress: (value, total) => {
                        onProgress(value, total, dbFile);
                    },
                    onend: () => {
                        console.log('end')
                    },
                    useWebWorkers: true,
                });
                resolve(blob);
            }
        })

    }

    async get(path, onProgress) {
        const db = await this.openDBStore();
        const file = await this.getDBStore(db, path);
        if (file) {
            return file.content;
        } else {
            try {
                const buffers = await this.download({
                    url: path,
                    chunkSize: 15 * 1024 * 1024,
                    poolLimit: 6,
                })
                const blob = new Blob([buffers]);
                this.setInDBStore(db, blob, path);
                return blob;

            } catch (e) {
                console.error(e);
                throw Error(e);
            }
        }
    }


    async removeFile(filename) {
        /*const dbFile = this.files[filename];
        if(dbFile){
           return new Promise((resolve, reject) => {
                    this.openDBStore().then(db => {
                        this.deleteDBStore(db, dbFile).then(v => {
                            delete this.files[filename];
                            resolve(true);
                        });
                    }).catch(event=>{
                        console.error("Cannot open database");
                        reject(null);
                    });
                });
        }*/

    }

    async deleteDBStore(db, path) {
        return new Promise((resolve, reject) => {
            const store = db.transaction(DB_NAME, "readwrite").objectStore(DB_NAME);
            resolve(store.delete(path));
        })
    }

    setInDBStore(db, blob, path) {
        const store = db.transaction(DB_NAME, "readwrite").objectStore(DB_NAME);
        store.put(blob, path);
    }

    async getDBStore(db, key) {
        return new Promise((resolve, reject) => {
            const store = db.transaction(DB_NAME, 'readonly').objectStore(DB_NAME);
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
                /*const store: IDBObjectStore = */
                db.createObjectStore(DB_NAME, {keyPath: "id"});
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

    getBinaryContent(url, start, end, i) {
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

    async download({url, chunkSize, poolLimit = 1}) {
        const contentLength = await this.getContentLength(url);
        const chunks =
            typeof chunkSize === "number" ? Math.ceil(contentLength / chunkSize) : 1;
        const results = await this.asyncPool(
            poolLimit,
            [...new Array(chunks).keys()],
            (i) => {
                let start = i * chunkSize;
                let end = i + 1 == chunks ? contentLength - 1 : (i + 1) * chunkSize - 1;
                return this.getBinaryContent(url, start, end, i);
            }
        );
        const sortedBuffers = results
            .map((item) => new Uint8Array(item.buffer));
        return this.concatenate(sortedBuffers);
    }

}
