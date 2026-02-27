# /e/OS Installer



[![online](https://img.shields.io/badge//e/OS-installer-blue.svg)](https://e.foundation/installer)
[![devices](https://img.shields.io/badge/supported-devices-blue.svg)](https://gitlab.e.foundation/e/devices/eos-installer/-/tree/main/app/public/resources)
[![license](https://img.shields.io/badge/license-GPLv3-greenn.svg)](LICENSE)
[![doc](https://img.shields.io/badge/user-guide-green.svg)](https://doc.e.foundation/eos-installer) 
[![contributing](https://img.shields.io/badge/help-contributing-orange.svg)](CONTRIBUTING.md)

Install /e/OS on a device from a chromium-based browser.

![teasing](.artifacts/eos-installer-teasing.gif)

## Features

- Detect the device
- Guide the user to unlock the bootloader
- Guide the user to flash /e/OS
- When possible, guide the user to lock the bootloader

## Run the project

1. Get the docker image
   ```
   docker pull registry.gitlab.e.foundation/e/devices/eos-installer:latest
   ```
2. Run a docker container
    ```
    docker run -p 3000:80 eos-installer
    ```
3. The app is available at http://localhost:3000

## Local ZIP mode (debug)

To test installation from a local ZIP file instead of direct download:

1. Open the installer with `debug=1`, for example: `http://localhost:3000/?debug=1`
2. Continue until the **Downloading /e/OS** step
3. Choose one of:
   - **Download build**: default online flow
   - **Use local ZIP**: pick a local `.zip` file

Without `debug=1`, the installer keeps the default auto-download behavior.

## Acknowledgments

Using:
- vanilla Javascript, CSS and HTML
- vite as builder
- docker for packaging

Libraries:
- fastboot.js (License: MIT): https://gitlab.e.foundation/e/tools/fastboot.js
- ya-webadb (License: MIT): https://github.com/yume-chan/ya-webadb
- and more see [package.json](https://gitlab.e.foundation/e/devices/eos-installer/-/blob/main/app/package.json)
