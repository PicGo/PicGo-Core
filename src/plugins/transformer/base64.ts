import PicGo from '../../core/PicGo'

const handle = async (ctx: PicGo): Promise<PicGo> => {
  ctx.output.push(...ctx.input)
  return ctx
}

export default {
  handle
}
