import {clamp,distance,midpoint} from './touchGeometry.mjs'
export function fitImage(width,height,stageWidth,stageHeight){const s=Math.min(stageWidth/width,stageHeight/height);return {x:(stageWidth-width*s)/2,y:(stageHeight-height*s)/2,width:width*s,height:height*s}}
export function normalizeCrop(rect){if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite))return null;const x=clamp(rect.x,0,.98),y=clamp(rect.y,0,.98);return {x,y,width:clamp(rect.width,.02,1-x),height:clamp(rect.height,.02,1-y)}}
export function resizeCrop(rect,handle,dx,dy,bounds,ratio=0){
 const min=Math.min(36,bounds.width*.2,bounds.height*.2)
 let x0=rect.x,y0=rect.y,x1=rect.x+rect.width,y1=rect.y+rect.height
 if(handle==='move'){const x=clamp(x0+dx,bounds.x,bounds.x+bounds.width-rect.width),y=clamp(y0+dy,bounds.y,bounds.y+bounds.height-rect.height);return {...rect,x,y}}
 const left=handle.includes('w'),top=handle.includes('n'),anchorX=left?x1:x0,anchorY=top?y1:y0
 let w=clamp(rect.width+(left?-dx:dx),min,left?anchorX-bounds.x:bounds.x+bounds.width-anchorX),h=clamp(rect.height+(top?-dy:dy),min,top?anchorY-bounds.y:bounds.y+bounds.height-anchorY)
 if(ratio){const maxW=left?anchorX-bounds.x:bounds.x+bounds.width-anchorX,maxH=top?anchorY-bounds.y:bounds.y+bounds.height-anchorY;w=Math.max(min,Math.abs(dx)>Math.abs(dy)?w:h*ratio);w=Math.min(w,maxW,maxH*ratio);h=w/ratio}
 return {x:left?anchorX-w:anchorX,y:top?anchorY-h:anchorY,width:w,height:h}
}

// Keep the photo point under the fingers fixed while the crop window stays put.
export function pinchCrop(image,frame,from,to,maxWidth) {
 const factor=clamp(distance(to)/Math.max(1,distance(from)),Math.max(frame.width/image.width,frame.height/image.height),maxWidth/image.width)
 const a=midpoint(from),b=midpoint(to),width=image.width*factor,height=image.height*factor
 return {x:clamp(b.x-(a.x-image.x)*factor,frame.x+frame.width-width,frame.x),y:clamp(b.y-(a.y-image.y)*factor,frame.y+frame.height-height,frame.y),width,height}
}
