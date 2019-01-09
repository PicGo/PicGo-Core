const generate = (name: string, path: string, to: string, done: Function): void => {
  console.log(name, path, to, done)
  done('123')
}

export default generate
