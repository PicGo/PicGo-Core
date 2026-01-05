import 'dotenv/config'
export const BASE_URL = process.env.PICGO_CLOUD_API_URL || 'https://picgo.app'
console.log('BASE_URL:', BASE_URL)