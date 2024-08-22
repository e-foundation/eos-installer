[last updated : 2023-10-17 ]

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
`docker run -v "$(pwd)/src:/app/src" -p 127.0.0.1:3000:3000 eos-web-installer` 

The project is available at `http://localhost:3000/`

# Installation

Drop the files used to flash the device in the corresponding folder in  `static/assets/sources`
And **overwrite the .json** `static/resources` file of your device with the correct file name

# Development information


## Model

We link device and its resources with deviceName.toLowerCase().replace(/ /g, ''); ex: One Plus Nord -> oneplusnord.json
Since the deviceName may not be the same in fastboot (Android), we need at least a first connexion in adb to retrieve the deviceName.

## Doctrine

- my-class are for css class
- camelCase are for variable
- $variableName are for DOM Nodes
- MAJUSCULE are for global constant
- object.manager.js are for class directing subClass or vue. It's just my arbitrary concept to mark a class as "directive" in the process
- object.class.js are for class used by object.manager.js where functions should have a single responsibility

Please respect ♥ 


## Defining a process

A process is in  2 parts : steps and folder

### Steps

#### Description

Steps is an array on objects describing the process

```
"steps": [
    {
      "mode": string?,
      "command" : string?,
      "instruction": string?,
      "needUser": boolean?
    }
  ]
```
#### Options

| key           | exemple                         | description                                                                 |
|---------------|---------------------------------|-----------------------------------------------------------------------------|
| `mode`        | `[fastboot\| adb\| bootloader]` | It's a shortcut for a reboot and a reconnect before the command is executed |
| `needUser`    | `[true\| false]`                | The user needs to click on continue before the command is executed          |
| `instruction` | `Please select unlock`          | String displayed to the user at this step. Command is used if not defined   |
| `command`     | `flashing unlock unlocked`      | Command as defined in the next chapter                                      |

#### Available commands

| command                                | exemple                    | description     |
|----------------------------------------|----------------------------|-----------------|
| `[flashing\| oem] unlock [varName?]`   | `flashing unlock unlocked` | --------------  |
| `[flashing\|oem] lock [varName?]`      | `flashing lock`            | --------------  |
| `flash [partitionName] [fileName.img]` | `flashing unlock unlocked` | --------------  |
| `sideload [fileName.zip]`              | `sideload romFile.zip`     | --------------  |
| `erase [partitionName]`                | `erase userdata`           | --------------  |
| `reboot [fastboot\| adb\| bootloader]` | `reboot bootloader`        | --------------  |
| `connect [adb\| bootloader]`           | `connect device`           | --------------  |


For oem, recovery, rom and key, we parse these command and execute them. The others commands are not analyzed and executed arbitrarily in the device.





#### Exemples


### Folder

#### Description

You need to add a variable folder to define the files needed in the installation.
Folder is an array of file :
```
{ 
    name : fileName used for the command ,
    path: path used to download the file,
    unzip: optional boolean in case we have a zip we want to parse
}
```
In case of unzip : the file is unzipped, and the retrieved files are stored in the "folder" like the other file


#### Exemples
```  
{
  "android": 13,
  "security_patch_level": "2024-04-05",
  "steps": [
    ...
  ],
    "folder": [
      {
        "name": "recovery.img"
        "path" : "assets/sources/coral/recovery-e-1.14-s-20230818321663-dev-coral.img"
      },
      {
        "name": "rom.zip",
        "path" : "assets/sources/coral/e-1.14-s-20230818321663-dev-coral.zip"
      },
      {
        "name": "pkmd_pixel.bin",
        "path" : "assets/sources/coral/pkmd_pixel.bin"
      },
      {
        "path" : "assets/sources/emerald/IMG-e-1.14.2-s-20230825321006-stable-emerald.zip", 
        "name": "Teracube_2e installer",
        "unzip": true 
      },
    ]
 }
  ```

* android: Android version (optional) => Display warning if version mistach (Installed vs easy installer one)
* security_patch_level (optional) => Allow to load safe procedure descriptor file (postfixed with '-safe' eg: 'teracube2e.json vs teracube2e-safe.json') that contain a specific install process (eg does not lock the bootloader if current_security_path_level > new_security_path_level new_security_path_level is the one the json file)
* folder: must be an array

## Vue

### vue.manager.js
Need log.manager.js and translation.manager.js
Need a div with id "process"

### log.manager.js
Need a div with id "log-ctn" to scroll on log added
Need a select with id "log" to add log

### translation.manager.js
Need a select with id "translation" to listen to.
On select change : download the translation file and render the DOM

Translation are in `static/assets/languages`

## Controller

### controller.manager.js


CAUTION

