import lowdb from 'lowdb'
import lodashId from 'lodash-id'
import FileSync from 'lowdb/adapters/FileSync'
import json from 'comment-json'

const initConfig = (configPath: string): lowdb.LowdbSync<any> => {
  const adapter = new FileSync(configPath, {
    serialize (obj: object): string {
      return json.stringify(obj, null, 2)
    },
    deserialize: json.parse
  })
  const db = lowdb(adapter)
  db._.mixin(lodashId)

  if (!db.has('picBed').value()) {
    db.set('picBed', {
      current: 'smms'
    }).write()
  }
  if (!db.has('picgoPlugins').value()) {
    db.set('picgoPlugins', {}).write()
  }

  return db
}

const saveConfig = (configPath: string, config: any): void => {
  const db = initConfig(configPath)
  Object.keys(config).forEach((name: string) => {
    db.read().set(name, config[name]).write()
  })
}

export {
  initConfig,
  saveConfig
}
