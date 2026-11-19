export function drawEditorCell(ctx, row, col, color, cell, labels) {
  const x=col*cell,y=row*cell
  ctx.fillStyle=color?.hex||((row+col)%2?'#ECEAF0':'#F9F8FC');ctx.fillRect(x,y,cell,cell)
  ctx.strokeStyle='rgba(40,35,60,.17)';ctx.lineWidth=.7;ctx.strokeRect(x+.35,y+.35,cell-.7,cell-.7)
  if(labels&&color){ctx.font=`${cell*.29}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color.r*.299+color.g*.587+color.b*.114>140?'#24212E':'#fff';ctx.fillText(color.code,x+cell/2,y+cell/2,cell-2)}
}
export function drawEditorGrid(canvas, pattern, cell=24, labels=true) {
  canvas.width=canvas.height=pattern.length*cell
  const ctx=canvas.getContext('2d')
  pattern.forEach((line,row)=>line.forEach((color,col)=>drawEditorCell(ctx,row,col,color,cell,labels)))
  return ctx
}
