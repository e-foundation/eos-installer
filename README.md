# /e/OS Installer

Install /e/OS on a device from a chromium-based browser

- **Online instance**: [https://e.foundation/installer](https://e.foundation/installer)
- **Documentation**: [https://doc.e.foundation/eos-installer](https://doc.e.foundation/eos-installer)
- **Source code**: [https://gitlab.e.foundation/e/devices/eos-installer](https://gitlab.e.foundation/e/devices/eos-installer)

## Features

- detect the device
- guide the user to unlock the bootloader
- guide the user to flash /e/OS
- when possible, guide the user to lock the bootloader

## Run the project

1. Get the docker image: `docker pull registry.gitlab.e.foundation/e/devices/eos-installer:latest`
2. Run a docker container
    - Windows: `docker run -p 3000:80 eos-installer`
    - Linux: `docker run -p 3000:80 eos-installer`
3. The app is available at `http://localhost:3000/`

## Supported devices

The list of supported devices is available [here](https://gitlab.e.foundation/e/devices/eos-installer/-/tree/main/app/public/resources).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPLv3](https://gitlab.e.foundation/e/devices/web-easy-installer/-/blob/main/LICENSE)

## Acknowledgments

Using:
- vanilla Javascript, CSS and HTML
- vite as builder
- Docker for packaging

Libraries:
- fastboot.js (License: MIT): https://github.com/kdrag0n/fastboot.js/ 
- ya-webadb (License: MIT): https://github.com/yume-chan/ya-webadb
- see [package.json](https://gitlab.e.foundation/e/devices/eos-installer/-/blob/main/app/package.json)
