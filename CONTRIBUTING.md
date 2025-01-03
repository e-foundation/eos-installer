# Contributing

## Install

[nodeJS](https://nodejs.org/en/download)

## Launch the app

```
npm install
npm run dev
```

Open chrome base browser and go to http://localhost:5173/.

## Add a new device

1. Get the device code from the stock ROM
    - We link device and its resources with deviceName.toLowerCase().replace(/ /g, ''); ex: One Plus Nord -> oneplusnord.json
    - Since the deviceName may not be the same in fastboot (Android), we need at least a first connexion in adb to retrieve the deviceName
2. Understand how does the flash process works
3. Configure the flash process
    - Define the steps in an array of objects describing the process
        - template: 
            ```json 
            "steps": [
                {
                  "mode": string?,
                  "command" : string?,
                  "instruction": string?,
                  "needUser": boolean?
                }
              ]
            ```
        - Options
    
            | key           | exemple                         | description                                                                 |
            |---------------|---------------------------------|-----------------------------------------------------------------------------|
            | `mode`        | `[fastboot\| adb\| bootloader]` | It's a shortcut for a reboot and a reconnect before the command is executed |
            | `needUser`    | `[true\| false]`                | The user needs to click on continue before the command is executed          |
            | `instruction` | `Please select unlock`          | String displayed to the user at this step. Command is used if not defined   |
            | `command`     | `flashing unlock unlocked`      | Command as defined in the next chapter                                      |
        - Available commands
    
            | command                                | exemple                    | description     |
            |----------------------------------------|----------------------------|-----------------|
            | `[flashing\| oem] unlock [varName?]`   | `flashing unlock unlocked` | --------------  |
            | `[flashing\|oem] lock [varName?]`      | `flashing lock`            | --------------  |
            | `flash [partitionName] [fileName.img]` | `flashing unlock unlocked` | --------------  |
            | `sideload [fileName.zip]`              | `sideload romFile.zip`     | --------------  |
            | `erase [partitionName]`                | `erase userdata`           | --------------  |
            | `reboot [fastboot\| adb\| bootloader]` | `reboot bootloader`        | --------------  |
            | `connect [adb\| bootloader]`           | `connect device`           | --------------  |

        > For oem, recovery, rom and key, we parse these command and execute them. The others commands are not analyzed and executed arbitrarily in the device.
      
    - Define the folder, an array describing the files involved in the flash process
        - template: 
            ```json
            "folder": [
              { 
                "name" : "filename.zip", # fileName used for the command.
                "path": "https://domain.com/image.zip", # path used to download the file.
                "unzip": true # optional boolean in case we have a zip we want to uncompress. 
              }
            ]
            ```

            > In case of unzip : the file is unzipped, and the retrieved files are stored in the "folder" like the other file
        - example:
    
            ```json
            {
                "folder": [
                  {
                    "name": "recovery.img"
                    "path" : "assets/sources/coral/recovery-e-latest-s-community-coral.img"
                  },
                  {
                    "name": "rom.zip",
                    "path" : "assets/sources/coral/e-latest-s-community-coral.zip"
                  },
                  {
                    "name": "pkmd_pixel.bin",
                    "path" : "assets/sources/coral/pkmd_pixel.bin"
                  },
                  {
                    "path" : "assets/sources/emerald/IMG-e-latest-s-official-emerald.zip",
                    "name": "Teracube_2e installer",
                    "unzip": true 
                  },
                ]
            }
            ```
4. Adding images
    - Add the images files within `app/public/assets/images/illustrations/fp5`
    - declare the image in the html, at `app/index.html`
        - example:
            ```html
            <!-- FP5 -->
            <div id="locking-fp5" class="card inactive">
                <div class="card-header" data-translate="locking"></div>
                <div class="card-body">
                    <p data-translate="locking-instructions-1"></p>
                    <p data-translate="locking-instructions-2"></p>
                    <div class="text-center">
                        <img class="instruction-img" src="assets/images/illustrations/fp5/Illustration - Accept warning-1.png">
                    </div>
                </div>
                <div class="card-footer">
                    <button data-translate="next" class="next"></button>
                </div>
            </div>
            ```

## Other

- Vues
    - `vue.manager.js`
        - Need log.manager.js and translation.manager.js
        - Need a div with id "process"
    - `log.manager.js`
        - Need a div with id "log-ctn" to scroll on log added
        - Need a select with id "log" to add log
    - `translation.manager.js`
        - Need a select with id "translation" to listen to.
        - On select change : download the translation file and render the DOM
    - Translation are in `static/assets/languages`
- Controller
    - `controller.manager.js`

## Doctrine

- my-class are for css class
- camelCase are for variable
- $variableName are for DOM Nodes
- MAJUSCULE are for global constant
- object.manager.js are for class directing subClass or vue. It's just my arbitrary concept to mark a class as "directive" in the process
- object.class.js are for class used by object.manager.js where functions should have a single responsibility

Please respect ♥
