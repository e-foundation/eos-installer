const PRODUCT = '/e/OS Web Installer';
const VERSION = '0.5.1';

const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static(__dirname + '/static'));


console.log(`Starting ${PRODUCT} ${VERSION}`);

app.listen(3000, () => console.log('Listening on port 3000'));

const gracefulShutdown = () => {
    process.exit();
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Sent by nodemon
