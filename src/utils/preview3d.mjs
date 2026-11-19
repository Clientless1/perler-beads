export const FINISHES = [
  { id: 'beads', name: '原豆', detail: '圆润颗粒 · 清晰豆孔', radius: .45, hole: .17, round: .5, thickness: .19 },
  { id: 'light', name: '轻烫留孔', detail: '轻微融合 · 保留大孔', radius: .49, hole: .12, round: .46, thickness: .13 },
  { id: 'round', name: '常规圆烫', detail: '边缘融合 · 小孔质感', radius: .5, hole: .055, round: .35, thickness: .09 },
  { id: 'flat', name: '平烫封孔', detail: '表面平整 · 豆孔闭合', radius: .505, hole: 0, round: .22, thickness: .04 },
  { id: 'square', name: '像素方烫', detail: '方形像素 · 紧密拼接', radius: .505, hole: 0, round: .025, thickness: .035 },
]
export function projectBeads(pattern, { yaw = -.2, pitch = .36, melted = false } = {}) {
  const size=pattern.length, cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),points=[]
  for(let row=0;row<size;row++)for(let col=0;col<(pattern[row]?.length||0);col++){
    const color=pattern[row][col];if(!color)continue
    const x=col-(size-1)/2,y=row-(size-1)/2,z=melted?.08:.3
    const rx=x*cy+z*sy,rz=-x*sy+z*cy,ry=y*cx-rz*sx,depth=y*sx+rz*cx
    points.push({x:rx,y:ry,depth,color,row,col})
  }
  return points.sort((a,b)=>a.depth-b.depth)
}
function rounded(ctx, x, y, w, radius) {
  const r = Math.min(w / 2, radius)
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+w-r); ctx.quadraticCurveTo(x+w,y+w,x+w-r,y+w); ctx.lineTo(x+r,y+w); ctx.quadraticCurveTo(x,y+w,x,y+w-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y)
}
// Build the material once. Gestures draw one cached texture, not thousands of
// cross-layer bead commands. Keep at most two material textures in memory.
export function createBeadPreview(pattern, createCanvas) {
  const cache = new Map(), size = pattern.length, cell = Math.min(24, Math.max(10, Math.floor(1200 / size)))
  return {
    texture(id) {
      if (cache.has(id)) return cache.get(id)
      const finish = FINISHES.find(f => f.id === id) || FINISHES[0], node = createCanvas(size * cell, size * cell), ctx = node.getContext('2d'), sprites = new Map()
      for (const row of pattern) for (const color of row) if (color && !sprites.has(color.hex)) {
        const sprite = createCanvas(cell, cell), c = sprite.getContext('2d'), r = cell * finish.radius, start = cell / 2 - r
        rounded(c, start, start, r*2, cell*finish.round)
        c.fillStyle=color.hex; c.fill()
        if (id !== 'square' && id !== 'flat') {
          const shine=c.createLinearGradient(0,0,cell,cell);shine.addColorStop(0,'rgba(255,255,255,.34)');shine.addColorStop(.5,'rgba(255,255,255,0)');shine.addColorStop(1,'rgba(0,0,0,.20)');c.fillStyle=shine;c.fill()
        }
        if(finish.hole){c.globalCompositeOperation='destination-out';c.beginPath();c.arc(cell/2,cell/2,cell*finish.hole,0,Math.PI*2);c.fill();c.globalCompositeOperation='source-over';c.beginPath();c.arc(cell/2,cell/2,cell*finish.hole+.4,Math.PI,Math.PI*2);c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=.8;c.stroke()}
        sprites.set(color.hex,sprite)
      }
      pattern.forEach((row,y)=>row.forEach((color,x)=>{if(color)ctx.drawImage(sprites.get(color.hex),x*cell,y*cell)}))
      if(cache.size>=2)cache.delete(cache.keys().next().value)
      const result={node,finish};cache.set(id,result);return result
    },
    clear(){cache.clear()},
  }
}
export function drawBeadPreview(ctx, texture, { width, height, yaw = -.2, pitch = .36, scale = 1, dpr = 1, attribution }) {
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#22212A';ctx.fillRect(0,0,width,height)
  const {node,finish}=texture, unit=(Math.min(width-38,height-65)*scale)/node.width
  ctx.save();ctx.translate(width/2,height/2-8)
  ctx.transform(Math.cos(yaw)*unit,Math.sin(yaw)*Math.sin(pitch)*unit,0,Math.cos(pitch)*unit,0,0)
  ctx.globalAlpha=.18;ctx.drawImage(node,-node.width/2+5,-node.height/2+12);ctx.globalAlpha=1
  if(finish.thickness>.05){ctx.globalAlpha=.5;ctx.drawImage(node,-node.width/2,-node.height/2+18*finish.thickness);ctx.globalAlpha=1}
  ctx.drawImage(node,-node.width/2,-node.height/2);ctx.restore()
  if(attribution){ctx.fillStyle='#B9B5C7';ctx.font='9px sans-serif';ctx.fillText(`${attribution.title} · ${attribution.author} · ${attribution.license} · Modified`,10,height-25,width-20);ctx.font='8px sans-serif';ctx.fillText(`${attribution.url} · ${attribution.licenseUrl}`,10,height-11,width-20)}
}
