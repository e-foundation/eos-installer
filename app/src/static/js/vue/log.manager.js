export class LogManager {
    constructor() {
        this.logs = [];
    }

    async init() {
        this.$log = document.getElementById('log');
        this.$logCtn = document.getElementById('log-ctn');
        return !!this.$log;
    }

    log(log, id, isError) {
        this.logs.push({
            date: new Date(),
            log,
        });
        if (log instanceof Error) {
            console.error(log);
        }
        if (this.$log) {
            let span = id ? document.getElementById(id) || document.createElement("SPAN") : document.createElement("SPAN");
            span.id = id;
            span.innerText = log;
            if (isError) {
                span.classList.add('error');
            }
            if (!span.parentNode) {
                this.$log.append(span);
                this.$log.append('\n');
                this.scrollToBottom();
            }
        }
    }

    error(log, id) {
        this.log(log, id, true);
    }

    untie(id) {
        const span = document.getElementById(id);
        delete span.id;
    }

    clear() {
        this.$log.innerText = '';
        this.logs = [];
    }

    scrollToBottom() {
        this.$logCtn.scrollTo(0, this.$logCtn.scrollHeight);
    }
}