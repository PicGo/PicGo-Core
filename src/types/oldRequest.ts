export type IMethod =
  | 'get' | 'GET'
  | 'delete' | 'DELETE'
  | 'head' | 'HEAD'
  | 'options' | 'OPTIONS'
  | 'post' | 'POST'
  | 'put' | 'PUT'
  | 'patch' | 'PATCH'
  | 'purge' | 'PURGE'
  | 'link' | 'LINK'
  | 'unlink' | 'UNLINK'

export interface IHeaders {
  [key: string]: any
}

export interface IRequestPromiseOptions {
  baseUrl?: string | undefined
  url?: string
  method?: IMethod
  formData?: { [key: string]: any } | undefined
  qs?: any
  json?: boolean
  body?: any
  resolveWithFullResponse?: boolean
  headers?: IHeaders
  proxy?: any
  timeout?: number
}
