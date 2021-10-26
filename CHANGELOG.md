# :tada: 1.5.0-alpha.0 (2021-10-26)


### :package: Chore

* **build:** migrate to esbuild and change export assignment to esm export ([#102](https://github.com/PicGo/PicGo-Core/issues/102)) ([2a6cd18](https://github.com/PicGo/PicGo-Core/commit/2a6cd18))



## :tada: 1.4.26 (2021-08-23)


### :bug: Bug Fixes

* engine bug in package.json ([1c65144](https://github.com/PicGo/PicGo-Core/commit/1c65144))



## :tada: 1.4.25 (2021-08-21)


### :bug: Bug Fixes

* handle clipboard file path error ([ff4ec86](https://github.com/PicGo/PicGo-Core/commit/ff4ec86)), closes [#97](https://github.com/PicGo/PicGo-Core/issues/97)
* **error:** throw error when transform failed ([#96](https://github.com/PicGo/PicGo-Core/issues/96)) ([57fce75](https://github.com/PicGo/PicGo-Core/commit/57fce75))
* clipboard path contains space ([#95](https://github.com/PicGo/PicGo-Core/issues/95)) ([d2b73c1](https://github.com/PicGo/PicGo-Core/commit/d2b73c1))



## :tada: 1.4.24 (2021-08-01)


### :sparkles: Features

* uploaded now can be modified since picgo will not use this value ([b6a8b58](https://github.com/PicGo/PicGo-Core/commit/b6a8b58))



## :tada: 1.4.23 (2021-07-27)


### :bug: Bug Fixes

* cases when clipboard of wsl contain image file ([#91](https://github.com/PicGo/PicGo-Core/issues/91)) ([adfc55e](https://github.com/PicGo/PicGo-Core/commit/adfc55e))


### :package: Chore

* add github actions for publishing ([caae80e](https://github.com/PicGo/PicGo-Core/commit/caae80e))



## :tada: 1.4.22 (2021-07-27)


### :sparkles: Features

* **smms:** smms now supports image without token ([#89](https://github.com/PicGo/PicGo-Core/issues/89)) ([456b81c](https://github.com/PicGo/PicGo-Core/commit/456b81c))
* add support for clipboard in wsl ([#87](https://github.com/PicGo/PicGo-Core/issues/87)) ([3e230de](https://github.com/PicGo/PicGo-Core/commit/3e230de))



## :tada: 1.4.21 (2021-05-09)


### :bug: Bug Fixes

* output empty after uploading when using isolate context ([79c228b](https://github.com/PicGo/PicGo-Core/commit/79c228b))



## :tada: 1.4.20 (2021-05-09)


### :sparkles: Features

* add createContext for each upload process ([ecde023](https://github.com/PicGo/PicGo-Core/commit/ecde023))


### :package: Chore

* add debug launch.json ([9950259](https://github.com/PicGo/PicGo-Core/commit/9950259))



## :tada: 1.4.19 (2021-04-04)


### :sparkles: Features

* add current uploader && transformer log ([67b2bb1](https://github.com/PicGo/PicGo-Core/commit/67b2bb1))
* limit some of config's capabilities ([f901505](https://github.com/PicGo/PicGo-Core/commit/f901505))



## :tada: 1.4.18 (2021-03-06)


### :bug: Bug Fixes

* unregister plugin delete pluginMap ([85228d8](https://github.com/PicGo/PicGo-Core/commit/85228d8))



## :tada: 1.4.17 (2021-02-09)


### :bug: Bug Fixes

* **type:** type error in index.d.ts ([f617658](https://github.com/PicGo/PicGo-Core/commit/f617658)), closes [#69](https://github.com/PicGo/PicGo-Core/issues/69)



## :tada: 1.4.16 (2021-02-08)


### :sparkles: Features

* add proxy & registry options for pluginHandler ([b10b963](https://github.com/PicGo/PicGo-Core/commit/b10b963))
* dynamic proxy getter with ctx.Request.request ([687805f](https://github.com/PicGo/PicGo-Core/commit/687805f)), closes [#64](https://github.com/PicGo/PicGo-Core/issues/64)
* supporting install specific version of plugin ([35e15b0](https://github.com/PicGo/PicGo-Core/commit/35e15b0))



## :tada: 1.4.15 (2021-01-24)


### :sparkles: Features

* add local plugin install/uninstall/update support & imporve plugin name handler ([f8ec464](https://github.com/PicGo/PicGo-Core/commit/f8ec464))



## :tada: 1.4.14 (2020-12-19)


### :bug: Bug Fixes

* types error ([303a4ec](https://github.com/PicGo/PicGo-Core/commit/303a4ec))



## :tada: 1.4.13 (2020-12-19)


### :sparkles: Features

* new addPlugin api for node projects ([5a18432](https://github.com/PicGo/PicGo-Core/commit/5a18432))


### :bug: Bug Fixes

* **type:** some type error ([233a6ca](https://github.com/PicGo/PicGo-Core/commit/233a6ca))
* pluginLoader can't get the full plugin list ([83535b9](https://github.com/PicGo/PicGo-Core/commit/83535b9)), closes [#60](https://github.com/PicGo/PicGo-Core/issues/60)



## :tada: 1.4.12 (2020-11-04)


### :bug: Bug Fixes

* let tcyun error info more detail ([ddf645f](https://github.com/PicGo/PicGo-Core/commit/ddf645f))
* not encode before uploading an image with url ([c0aee32](https://github.com/PicGo/PicGo-Core/commit/c0aee32))
* qiniu error handler ([de94212](https://github.com/PicGo/PicGo-Core/commit/de94212))



## :tada: 1.4.11 (2020-07-12)


### :bug: Bug Fixes

* initailize db function error ([df7d526](https://github.com/PicGo/PicGo-Core/commit/df7d526))



## :tada: 1.4.10 (2020-06-28)


### :bug: Bug Fixes

* url image hash bug ([e405221](https://github.com/PicGo/PicGo-Core/commit/e405221))



## :tada: 1.4.9 (2020-06-27)


### :sparkles: Features

* add plugin running && error logs ([6adc070](https://github.com/PicGo/PicGo-Core/commit/6adc070))
* **transformer:** add fallback to support more image formats such as HEIC ([0f5d2a9](https://github.com/PicGo/PicGo-Core/commit/0f5d2a9)), closes [#13](https://github.com/PicGo/PicGo-Core/issues/13)


### :bug: Bug Fixes

* multiline logs format ([444a42f](https://github.com/PicGo/PicGo-Core/commit/444a42f))
* the issue of lost logs ([daa7508](https://github.com/PicGo/PicGo-Core/commit/daa7508))
* the order of the uploaded list may not be the same as the order entered ([2bf1ed9](https://github.com/PicGo/PicGo-Core/commit/2bf1ed9)), closes [#40](https://github.com/PicGo/PicGo-Core/issues/40)
* unregisterPlugin's bug ([966bfd8](https://github.com/PicGo/PicGo-Core/commit/966bfd8))


### :package: Chore

* add vscode workspace settings & migrate tslint to eslint ([50a4842](https://github.com/PicGo/PicGo-Core/commit/50a4842))



## :tada: 1.4.8 (2020-04-04)


### :bug: Bug Fixes

* encode url before finishing ([7a6b39c](https://github.com/PicGo/PicGo-Core/commit/7a6b39c))
* return true if decodeURI throw error to avoid crash ([d09d77a](https://github.com/PicGo/PicGo-Core/commit/d09d77a))
* win10 cmd crash bug when "picgo upload" ([#35](https://github.com/PicGo/PicGo-Core/issues/35)) ([deec252](https://github.com/PicGo/PicGo-Core/commit/deec252))



## :tada: 1.4.7 (2020-03-07)


### :sparkles: Features

* add smms-v2 support ([7e10655](https://github.com/PicGo/PicGo-Core/commit/7e10655))
* remove weibo support ([96b2b3a](https://github.com/PicGo/PicGo-Core/commit/96b2b3a))


### :pencil: Documentation

* update README ([aff6326](https://github.com/PicGo/PicGo-Core/commit/aff6326))



## :tada: 1.4.6 (2020-02-23)


### :bug: Bug Fixes

* auto generate a local png bug ([c54ac67](https://github.com/PicGo/PicGo-Core/commit/c54ac67))



## :tada: 1.4.5 (2020-02-23)


### :sparkles: Features

* add upload image from URL support ([0d87342](https://github.com/PicGo/PicGo-Core/commit/0d87342))


### :package: Chore

* travis-ci deploy option ([a2a89cd](https://github.com/PicGo/PicGo-Core/commit/a2a89cd))



## :tada: 1.4.4 (2019-12-30)


### :bug: Bug Fixes

* image_repeated error from smms ([#28](https://github.com/PicGo/PicGo-Core/issues/28)) ([f246b8d](https://github.com/PicGo/PicGo-Core/commit/f246b8d))



## :tada: 1.4.3 (2019-12-27)


### :sparkles: Features

* add aliyun optionUrl option ([0a3bdea](https://github.com/PicGo/PicGo-Core/commit/0a3bdea))



## :tada: 1.4.2 (2019-12-26)


### :bug: Bug Fixes

* cli source ([be6cdcc](https://github.com/PicGo/PicGo-Core/commit/be6cdcc))



## :tada: 1.4.1 (2019-12-26)



# :tada: 1.4.0 (2019-12-26)


### :sparkles: Features

* add config methods && pluginHandler to ctx ([f9bb9fb](https://github.com/PicGo/PicGo-Core/commit/f9bb9fb))
* **plugin:** passing environment variables ([50467c7](https://github.com/PicGo/PicGo-Core/commit/50467c7))


### :bug: Bug Fixes

* correct sm.ms err msg ([#18](https://github.com/PicGo/PicGo-Core/issues/18)) ([f0a4e8a](https://github.com/PicGo/PicGo-Core/commit/f0a4e8a))
* pluginHandler args length error ([e15eac2](https://github.com/PicGo/PicGo-Core/commit/e15eac2))


### :package: Chore

* **types:** added typings field to export type inform… ([#23](https://github.com/PicGo/PicGo-Core/issues/23)) ([8bb16e7](https://github.com/PicGo/PicGo-Core/commit/8bb16e7))



## :tada: 1.3.7 (2019-05-12)


### :bug: Bug Fixes

* **clipboard:** clipboard image getter error in macOS ([8314604](https://github.com/PicGo/PicGo-Core/commit/8314604))



## :tada: 1.3.6 (2019-04-20)


### :bug: Bug Fixes

* clipboard image upload under win10 ([48b72ed](https://github.com/PicGo/PicGo-Core/commit/48b72ed))



## :tada: 1.3.5 (2019-04-15)


### :bug: Bug Fixes

* writing log sometimes disappeared ([d36c0ae](https://github.com/PicGo/PicGo-Core/commit/d36c0ae))


### :package: Chore

* add picgo bump version ([c312302](https://github.com/PicGo/PicGo-Core/commit/c312302))



