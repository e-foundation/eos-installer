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
    }

    async init() {
        //this.quota = await navigator.storage.estimate();
    }

    /*
    * */
    async downloadAndUnzipFolder(folder, onDownloadProgress, onUnzipProgress) {

        const filesDownloaded = await this.downloadFolder(folder, onDownloadProgress);

        const filesToUnzip = filesDownloaded.filter(file => file.unzip);
        const filesUnzipped = await this.unzipFolder(filesToUnzip, onUnzipProgress);
        const allFiles = filesDownloaded.concat(filesUnzipped);

        for (let i = 0; i < allFiles.length; i++) {
            this.files[allFiles[i].name] = allFiles[i].blob;
        }

    }
    async downloadFolder(folder, onDownloadProgress) {
        const totalToDownload = new Array(folder.length).fill(0);
        const totalDownloaded = new Array(folder.length).fill(0);
        const files = [];
        for (let i = 0; i < folder.length; i++) {
            files.push(this.downloadFile(folder[i], (value, total)=> {
                totalToDownload[i] = total;
                totalDownloaded[i] = value;
                const sumTotal = totalToDownload.reduce((partialSum, a) => partialSum + a, 0);
                const sumValue = totalDownloaded.reduce((partialSum, a) => partialSum + a, 0);
                onDownloadProgress(sumValue, sumTotal);
            }));
        }
        return Promise.all(files);
    }
    async unzipFolder(folder, onUnzipProgress) {
        const totalToUnzip = new Array(folder.length).fill(0);
        const totalUnzipped = new Array(folder.length).fill(0);
        const files = [];
        for (let i = 0; i < folder.length; i++) {
            const unzippedFiles = await this.unzip(folder[i].blob, (value, total)=> {
                totalToUnzip[i] = total;
                totalUnzipped[i] = value;
                const sumTotal = totalToUnzip.reduce((partialSum, a) => partialSum + a, 0);
                const sumValue = totalUnzipped.reduce((partialSum, a) => partialSum + a, 0);
                onUnzipProgress(sumValue, sumTotal);
            });
            files.push(...unzippedFiles);
        }
        return files;
    }

    async downloadFile(file, onDownloadProgress) {
        let blob = await this.download(file.path, (value, total) => {
            onDownloadProgress(value, total, file.name);
        });
        return {
            name : file.name,
            blob : blob,
            unzip : file.unzip
        };
    }


    /**
     *
     * @param folder : blob of a folder to unzip
     * @param onProgress : function called on the unzipping of a file of the folder
     * @returns {Promise<Awaited<unknown>[]>}
     * retrieve the entries of the unzipped folder
     * for each entry, return a blob
     */
    async unzip(folder, onProgress) {
        const zipReader = new zip.ZipReader(new zip.BlobReader(folder));
        const files = await zipReader.getEntries();
        const unzippingFiles = files.map(file=> {
            return this.getFileFromZip(file, onProgress);
        }); // Promises[<name : string, blob : blob>]
        const unzippedFiles = await Promise.all(unzippingFiles);
        await zipReader.close();
        return unzippedFiles;
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
        const file = this.files[name];
        if(!file){
            throw Error(`File ${name} was not previously downloaded`)
        }
        return this.files[name];
    }

    /*
    * getData from a zip file
    * */
    async getData(dbFile, fileEntry, onProgress) {
        return new Promise(async (resolve, reject) => {
            const db = await this.openDBStore();
            let file;
            try {
                //file = await this.getDBStore(db, dbFile);
            } catch (e) {
                console.log(e)
            }
            console.log(file)
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

    async download(path, onProgress) {
        const db = await this.openDBStore();
        let file;
        try {
            //file = await this.getDBStore(db, path);
        } catch (e) {
            console.log(e)
        }
        if (file) {
            return file.content;
        } else {
            try {
                const buffers = await this.fetch({
                    url: path,
                    chunkSize: 15 * 1024 * 1024,
                    poolLimit: 6,
                }, onProgress)
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

    getDBStore(db, key) {
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
