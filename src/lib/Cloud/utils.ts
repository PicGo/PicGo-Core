import axios from 'axios'
import { webcrypto } from 'node:crypto'
import type { ICloudUserInfo } from '../../types'
import { API_BASE_URL } from '../utils'

type ITokenExchangeResponse = {
  success: boolean
  token?: string
  message?: string
}

type IErrorResponse = {
  message?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const compactDefinedRecord = <T extends Record<string, unknown>>(value: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null)
  ) as Partial<T>
}

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

const toNonNegativeInteger = (value: unknown, fallback: number): number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

const toUnixMilliseconds = (value: number | string | Date | null | undefined): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' || value instanceof Date) {
    const timestamp = new Date(value).getTime()
    return Number.isNaN(timestamp) ? undefined : timestamp
  }

  return undefined
}

const isPaidCloudUser = (userInfo: ICloudUserInfo | null | undefined): boolean => {
  return (userInfo?.plan ?? 0) > 0
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
  return isRecord(data) && typeof data.message === 'string'
}

const exchangeToken = async (code: string, verifier: string): Promise<ITokenExchangeResponse> => {
  const res = await axios.post<ITokenExchangeResponse>('/api/tokens/exchange', { code, verifier }, {
    baseURL: API_BASE_URL
  })
  return res.data
}

export {
  chunkArray,
  compactDefinedRecord,
  exchangeToken,
  generatePkceVerifier,
  isErrorResponse,
  isPaidCloudUser,
  isRecord,
  pkceChallengeFromVerifier,
  toNonNegativeInteger,
  toUnixMilliseconds,
  toBase64Url
}

export type {
  IErrorResponse,
  ITokenExchangeResponse
}
