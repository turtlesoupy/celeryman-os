import cv2,numpy as np,subprocess,sys
src,ref,out=sys.argv[1:]
def levels(f):
 c=cv2.VideoCapture(f);all=[]
 for i in range(12):
  c.set(cv2.CAP_PROP_POS_MSEC,i*400);ok,a=c.read()
  if ok:all.append(a[::8,::8].reshape(-1,3))
 c.release();a=np.concatenate(all);return np.percentile(a,[2,90],axis=0)
a,b=levels(src),levels(ref);scale=(b[1]-b[0])/(a[1]-a[0]);offset=b[0]-a[0]*scale
c=cv2.VideoCapture(src);w,h=int(c.get(3)),int(c.get(4));raw=out+'.raw.mp4';wr=cv2.VideoWriter(raw,cv2.VideoWriter_fourcc(*'mp4v'),c.get(5),(w,h))
while True:
 ok,f=c.read()
 if not ok:break
 wr.write(np.clip(f*scale+offset,0,255).astype(np.uint8))
wr.release();c.release();subprocess.run(['ffmpeg','-y','-i',raw,'-c:v','libx264','-crf','18',out,'-loglevel','error'],check=True)
print({'scale':scale.tolist(),'offset':offset.tolist()})
