<div align="center" markdown="1">
  <sup>Special thanks to:</sup>
  <br>
  <a href="https://www.nocobase.com/?utm_source=picgo">
    <img alt="NocoBase sponsorship" width="400" src="https://static-docs.nocobase.com/Logo-Black.png">
  </a>

### [NocoBase, AI + No-Code Build reliable business systems](https://www.nocobase.com/?utm_source=picgo)

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

> PicGo uses `SM.MS(S.EE)` as the default upload image host.

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
    get                                       get current picgo module config (uploader/transformer/plugins)
    i18n [lang]                              change picgo language
    uploader                                 manage uploader configurations
    server [options]                         run PicGo as a standalone server
    login [token]                            login to cloud.picgo.app
    logout                                   logout from cloud.picgo.app
    cloud                                    manage PicGo Cloud
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

##### Select a configuration for one upload

Add `uploader`, `configName`, or `configId` to `POST /upload` to choose an existing saved configuration for that request. Configuration names are recommended for readability. Use URL encoding for names containing spaces, Chinese characters, or other special characters:

```js
const url = new URL('http://127.0.0.1:36677/upload')
url.searchParams.set('uploader', 'github')
url.searchParams.set('configName', '工作图床')

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ list: ['/absolute/path/photo.png'] })
})
const result = await response.json()
```

The same query parameters work with an empty body for clipboard uploads, JSON without `list` or with an empty `list`, and multipart uploads using the `files` field. If server authentication is enabled, include your existing `Authorization: Bearer <secret>` header.

| Upload options | Behavior |
| --- | --- |
| No upload options | Existing default upload behavior. |
| `uploader=github` | Use GitHub's currently selected configuration (`defaultId`, falling back to its first configuration). |
| `uploader=github&configName=Work` | Find `Work` within GitHub, ignoring case and surrounding whitespace. |
| `configName=Work` | Search registered uploader types; exactly one configuration must match. |
| `configId=<id>` | Search by exact ID, optionally restricted by `uploader`. IDs remain stable when configurations are renamed. |
| Both `configId` and `configName` | Use a unique ID match first; if it cannot be uniquely resolved, try the name. |

Unknown uploaders, missing or ambiguous configurations, and blank or repeated upload parameters return HTTP `400` with `{ success: false, result: [], items: [], code, message }`. Messages explain the lookup failure or ambiguity; specify `uploader` to disambiguate names shared across types. Invalid upload options never fall back to the global default uploader. Existing authentication failures remain HTTP `401`.

Upload options do not change global defaults or save the requested configuration to disk. Concurrent requests can use different configurations. Plugins that read configuration through the context passed to their lifecycle handler see the request's configuration; plugins that cache global configuration may need adaptation. Explicit plugin persistence and Cloud session maintenance retain their normal behavior. `uploader=picgo-cloud` uses the current Cloud login; these options do not switch Cloud accounts.

Applications providing a custom internal server upload adapter must forward the optional `UploadOptions` argument to `picgo.upload`: `uploadPaths(paths, options)` forwards to `picgo.upload(paths, options)`, and `uploadClipboard(options)` forwards to `picgo.upload(undefined, options)`. Existing adapters can still handle requests without selectors, but ignoring these options will ignore the requested destination.

#### Login to [PicGo Cloud](https://cloud.picgo.app)

```bash
picgo login
# or
picgo login <token>
```

#### Logout from [PicGo Cloud](https://cloud.picgo.app)

```bash
picgo logout
```

#### Check PicGo Cloud login status

Use `picgo cloud auth status` to inspect the current PicGo Cloud login state without triggering an interactive login. The check is non-blocking: when there is no local token it returns immediately without any network request.

```bash
picgo cloud auth status

# machine-readable output
picgo cloud auth status --format json
```

The command sets a process exit code so it can be used in scripts:

| Status        | Meaning                                          | Exit code |
| ------------- | ------------------------------------------------ | --------- |
| `logged_in`   | Token is valid                                   | `0`       |
| `logged_out`  | No local token                                   | `1`       |
| `invalid`     | Token exists but is rejected by the server (401) | `2`       |
| `error`       | Probe failed (network / server error)            | `3`       |

The `--format json` output is a single line, e.g.:

```json
{"status":"logged_in","loggedIn":true,"user":"someone","plan":1}
```

#### Inspect current module config

Use `picgo get` to read the currently selected picgo modules. Each subcommand supports `--format pretty|json` (defaults to `pretty`).

```bash
# current uploader type (resolved as picBed.uploader -> picBed.current -> picgo-cloud)
picgo get uploader

# current transformer (defaults to path)
picgo get transformer

# installed plugins with enabled/disabled state
picgo get plugins

# machine-readable output
picgo get uploader --format json
picgo get plugins --format json
```

In `json` mode each command prints a single parseable line, e.g.:

```json
{"uploader":"github"}
{"transformer":"path"}
{"plugins":[{"name":"picgo-plugin-xxx","enabled":true}]}
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

The SDK accepts the same selectors in the second argument:

```js
import { PicGo, UploadOptionError } from 'picgo'

const picgo = new PicGo()

try {
  await picgo.upload(['/absolute/path/photo.png'], {
    uploader: 'github',
    configName: '工作图床'
  })

  // A globally unique name can identify both the uploader and its configuration.
  await picgo.upload(undefined, { configName: '工作图床' })
} catch (error) {
  if (error instanceof UploadOptionError) {
    console.error(error.code, error.message)
  } else {
    throw error
  }
}
```

Invalid upload options reject the upload promise before processing inputs. Error codes are `INVALID_UPLOAD_OPTION`, `UNKNOWN_UPLOADER`, `UPLOAD_CONFIG_NOT_FOUND`, and `UPLOAD_CONFIG_AMBIGUOUS`. Temporary `setConfig`/`unsetConfig` calls on a scoped upload context affect that upload only; explicit `saveConfig`/`removeConfig` calls remain persistent. Existing SDK calls without upload options keep their behavior.

## Development

Use Node.js >= 22.13 and pnpm 11.7.0 for repository development. The package manager is pinned in `package.json`; `pnpm-workspace.yaml` records the allowed esbuild installation script. This tooling requirement does not change PicGo's published runtime requirements.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

## Documentation

For more details, you can checkout [documentation](https://docs.picgo.app/core/).
