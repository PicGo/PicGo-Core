import axios from 'axios'
import { webcrypto } from 'node:crypto'
import { API_BASE_URL } from '../utils'

type ITokenExchangeResponse = {
  success: boolean
  token?: string
  message?: string
}

type IErrorResponse = {
  message?: string
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const generatePkceVerifier = (): string => {
  const bytes = new Uint8Array(32)
  webcrypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

const pkceChallengeFromVerifier = async (verifier: string): Promise<string> => {
  const data = new TextEncoder().encode(verifier)
  const digest = await webcrypto.subtle.digest('SHA-256', data)
  return toBase64Url(new Uint8Array(digest))
}

const isErrorResponse = (data: unknown): data is IErrorResponse => {
  return typeof data === 'object' && data !== null && 'message' in data && typeof (data as IErrorResponse).message === 'string'
}

const exchangeToken = async (code: string, verifier: string): Promise<ITokenExchangeResponse> => {
  const res = await axios.post<ITokenExchangeResponse>('/api/tokens/exchange', { code, verifier }, {
    baseURL: API_BASE_URL
  })
  return res.data
}

export {
  exchangeToken,
  generatePkceVerifier,
  isErrorResponse,
  pkceChallengeFromVerifier,
  toBase64Url
}

export type {
  IErrorResponse,
  ITokenExchangeResponse
}
