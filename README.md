

`app` folder contains the source of the application.

`extern` folder contains dependencies that are *not* embedded from package.json
    This is the case for fastboot.js the `fastboot.js/dist` folder if modified must be copied into `app\src\static\js\fastboot` folder



# Build the image

Go to the `app` folder.

`docker build -t eos-web-installer .`

# Run the project

## Windows
`docker run -v "%cd%"\src:/app/src -p 127.0.0.1:3000:3000 eos-web-installer`

## Linux
`docker run -v "${pwd}"\src:/app/src -p 127.0.0.1:3000:3000 eos-web-installer`

The project is available at `http://localhost:3000/`




