export enum BuiltinRoutePath {
  AUTH_CALLBACK = '/auth/callback',
  UPLOAD = '/upload',
  HEARTBEAT = '/heartbeat'
}

// 这是一个 Type Guard
export function isBuiltinRoutePath(path: string): path is BuiltinRoutePath {
  return (Object.values(BuiltinRoutePath) as string[]).includes(path)
}