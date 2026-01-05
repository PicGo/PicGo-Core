declare module '*.sh' {
  const src: string
  export default src
}
declare module '*.applescript' {
  const src: string
  export default src
}
declare module '*.ps1' {
  const src: string
  export default src
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly PICGO_VERSION: string
    readonly PICGO_CLOUD_API_URL: string
  }
}
