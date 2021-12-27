import childProcess, { ChildProcess } from 'child_process'
import path from 'path'
// TODO: a stable plugin host manager
class PluginHostManager {
  private cp: ChildProcess | null = null
  init (): void {
    console.log(process.cwd(), __dirname)
    this.cp = childProcess.fork(path.join(__dirname, './pluginHost/node.js'))
    this.cp.on('message', (data: string) => {
      console.log(`cp message: ${data}`)
    })

    this.cp.on('exit', () => {
      console.log('exit!')
    })
  }
}

const pluginHostManager = new PluginHostManager()

export {
  pluginHostManager
}
