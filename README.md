<div align="center" markdown="1">
  <sup>Special thanks to:</sup>
  <br>
  <a href="https://go.warp.dev/picgo">
    <img alt="Warp sponsorship" width="400" src="https://raw.githubusercontent.com/warpdotdev/brand-assets/refs/heads/main/Github/Sponsor/Warp-Github-LG-03.png">
  </a>

### [Warp, the intelligent terminal for developers](https://go.warp.dev/picgo)
[Available for MacOS, Linux, & Windows](https://go.warp.dev/picgo)<br>

</div>

---

# PicGo-Core

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)
[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Fpicgo%2Fpicgo-core%2Fbadge%3Fref%3Dmaster&style=flat-square)](https://actions-badge.atrox.dev/picgo/picgo-core/goto?ref=master)
![npm](https://img.shields.io/npm/v/picgo.svg?style=flat-square)
[![PicGo Convention](https://img.shields.io/badge/picgo-convention-blue.svg?style=flat-square)](https://github.com/PicGo/bump-version)
![node](https://img.shields.io/badge/node-%3E%3D20.0.0-blue?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

A tool for image uploading. Both CLI & api supports. It also supports plugin system, please check [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) to find powerful plugins.

More details please see the [Homepage](https://picgo.app/) of PicGo.

**Typora supports PicGo-Core natively**.

## Installation

PicGo requires Node.js >= 20.19.0 or >= 22.12.0. For older PicGo versions (<= v1.5.x), Node.js >= 16 is sufficient. Cause we need the [stability of ES Module support](https://joyeecheung.github.io/blog/2025/12/30/require-esm-in-node-js-from-experiment-to-stability/).

### Global install

```bash
npm install picgo -g

# or

yarn global add picgo
```

### Local install

```bash
npm install picgo -D

# or

yarn add picgo -D
```

## Usage

### Use in CLI

> PicGo uses `SM.MS` as the default upload pic-bed.

Show help:

```bash
$ picgo -h

  Usage: picgo [options] [command]

  Options:
    -v, --version                            output the version number
    -d, --debug                              debug mode
    -s, --silent                             silent mode
    -c, --config <path>                      set config path
    -p, --proxy <url>                        set proxy for uploading
    -h, --help                               display help for command

  Commands:
    install|add [options] <plugins...>       install picgo plugin
    uninstall|rm <plugins...>                uninstall picgo plugin
    update [options] <plugins...>            update picgo plugin
    set <module> [name] [configName]         configure config of picgo modules (uploader/transformer/plugin)
    upload|u [input...]                      upload, go go go
    use [module] [name] [configName]         use module (uploader/transformer/plugin) of picgo
    i18n [lang]                              change picgo language
    uploader                                 manage uploader configurations
    server [options]                         run PicGo as a standalone server
    login [token]                            login to cloud.picgo.app
    logout                                   logout from cloud.picgo.app
    help [command]                           display help for command
```

#### Upload a picture from path

```bash
picgo upload /xxx/xx/xx.jpg
```

#### Upload a picture from clipboard

> picture from clipboard will be converted to `png`

```bash
picgo upload
```

Thanks to [vs-picgo](https://github.com/Spades-S/vs-picgo) && [Spades-S](https://github.com/Spades-S) for providing the method to upload picture from clipboard.

#### Run as a server

```bash
picgo server -p 36677 -h 127.0.0.1
```

#### Login to PicGo Cloud

```bash
picgo login
# or
picgo login <token>
```

#### Logout from PicGo Cloud

```bash
picgo logout
```

#### Manage uploader configs

Since v1.8.0, PicGo-Core supports multiple configurations per uploader. Just like the configuration of the Electron version of PicGo.

You can use `picgo set uploader <type> [configName]` to configure different uploader configurations.

And you can use `picgo use uploader <type> [configName]` to switch between different uploader configurations.

For example:

```bash
picgo set uploader github Test

picgo use uploader github Test
```

For more details, you can use `picgo uploader -h` to check the help of uploader management:

```bash
Usage: picgo uploader [options] [command]


Options:
  -h, --help                                display help for command

Commands:
  list [type]                               list uploader configurations
  rename <type> <oldName> <newName>         rename a config
  copy <type> <configName> <newConfigName>  copy a config (does not switch current uploader)
  rm <type> <configName>                    remove a config
```


#### Init a picgo plugin template

Note: the plugin's template initializer has moved to the standalone [picgo-init](https://github.com/PicGo/PicGo-Init) package.

You can use the following command to init a picgo plugin template:

```bash
npx picgo-init plugin <your-plugin-folder>
```

### Use in node project

#### Common JS

```js
const { PicGo } = require('picgo')
```

#### ES Module

```js
import { PicGo } from 'picgo'
```

#### API usage example

```js
const picgo = new PicGo()

// upload a picture from path
picgo.upload(['/xxx/xxx.jpg'])

// upload a picture from clipboard
picgo.upload()
```

## Documentation

For more details, you can checkout [documentation](https://docs.picgo.app/core/).
