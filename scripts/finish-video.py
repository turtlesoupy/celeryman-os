"""Match a wholly generated clip to its reference viewport and display texture.
A single affine transform is applied to the ENTIRE frame; no face/body layers.
"""
import cv2,numpy as np,subprocess,json,sys
source,reference,out=sys.argv[1:]
def measure(p):
 cap=cv2.VideoCapture(p);fps=cap.get(cv2.CAP_PROP_FPS);frames=[];boxes=[];i=0
 while True:
  ok,f=cap.read()
  if not ok:break
  frames.append(f)
  if i%max(1,round(fps/5))==0:
   b,g,r=cv2.split(f);v=np.max(f,axis=2)
   mask=((v<155)|((r>120)&(g<100)&(b<100)))
   y,x=np.nonzero(mask)
   if len(x)>100:boxes.append([np.quantile(x,.01),np.quantile(y,.01),np.quantile(x,.99),np.quantile(y,.99)])
  i+=1
 cap.release();return frames,np.median(boxes,axis=0),fps
ref,rb,rfps=measure(reference);frames,gb,gfps=measure(source)
w,h=ref[0].shape[1],ref[0].shape[0];s=(rb[3]-rb[1])/(gb[3]-gb[1]);tx=(rb[0]+rb[2])/2-s*(gb[0]+gb[2])/2;ty=(rb[1]+rb[3])/2-s*(gb[1]+gb[3])/2
background=np.median(np.concatenate([f[:8].reshape(-1,3) for f in ref[::max(1,len(ref)//5)]]),axis=0)
neutral=float(background.max()-background.min())<40 and float(background.min())>160
matrix=np.float32([[s,0,tx],[0,s,ty]])
raw=out+'.raw.mp4';writer=cv2.VideoWriter(raw,cv2.VideoWriter_fourcc(*'mp4v'),gfps,(w,h))
for f in frames:
 # Flat studio canvas outside the whole-frame transform; never replicate actor edge pixels.
 f=cv2.warpAffine(f,matrix,(w,h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=tuple(float(x) for x in background))
 if neutral:
  lo=np.min(f,axis=2);hi=np.max(f,axis=2)
  candidates=((lo>155)&((hi-lo)<48)).astype(np.uint8)
  n,labels,stats,cent=cv2.connectedComponentsWithStats(candidates)
  border=np.unique(np.concatenate([labels[0],labels[-1],labels[:,0],labels[:,-1]]))
  mask=np.isin(labels,border[border!=0]).astype(np.float32)
  alpha=cv2.GaussianBlur(mask,(3,3),.6)[:,:,None]
  f=np.clip(f*(1-alpha)+background*alpha,0,255).astype(np.uint8)
 small=cv2.resize(f,(round(w*360/h/2)*2,360),interpolation=cv2.INTER_AREA);f=cv2.resize(small,(w,h),interpolation=cv2.INTER_LINEAR)
 f=cv2.GaussianBlur(f,(3,3),.45).astype(np.float32)*(1 if neutral else 1.055)
 f[::3]*=.965
 writer.write(np.clip(f,0,255).astype(np.uint8))
writer.release();subprocess.run(['ffmpeg','-y','-i',raw,'-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',out,'-loglevel','error'],check=True)
json.dump({'source':source,'reference':reference,'scale':float(s),'translate':[float(tx),float(ty)],'reference_bounds':rb.tolist(),'generated_bounds':gb.tolist(),'neutral_studio_background':neutral,'note':'Whole generated frames only; no identity, face or body compositing.'},open(out+'.json','w'),indent=2)
