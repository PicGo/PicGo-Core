import { IPicGo } from '../../types'
const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  ctx.output.push(...ctx.input)
  return ctx
}

export default {
  handle
}
