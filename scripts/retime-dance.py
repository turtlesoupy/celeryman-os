"""Retimes complete generated video frames to a canonical dance's pose cadence.
No actor pixels, heads, faces, masks or layers are composited into the output.
The foreground masks below are used only as measurements for dynamic time warping.
"""
import cv2,numpy as np,sys,subprocess,json
from scipy.ndimage import gaussian_filter1d
ref,generated,out=sys.argv[1:]
def read(p):
 cap=cv2.VideoCapture(p);fps=cap.get(cv2.CAP_PROP_FPS);frames=[];features=[]
 while True:
  ok,f=cap.read()
  if not ok:break
  frames.append(f);hsv=cv2.cvtColor(f,cv2.COLOR_BGR2HSV)
  mask=(((hsv[:,:,1]>85)&(hsv[:,:,2]<225))|(hsv[:,:,2]<125)).astype(np.uint8)*255
  n,labels,stats,_=cv2.connectedComponentsWithStats(mask)
  if n<2:features.append(np.zeros(1536));continue
  idx=1+np.argmax(stats[1:,4]);x,y,w,h,area=stats[idx];crop=mask[y:y+h,x:x+w]
  features.append(cv2.resize(crop,(32,48)).reshape(-1)/255)
 cap.release();return frames,np.array(features),fps
A,af,rate=read(ref);B,bf,br=read(generated)
cost=np.mean(abs(af[:,None,:]-bf[None,:,:]),axis=2)
n,m=cost.shape;d=np.full((n+1,m+1),np.inf);d[0,0]=0
for i in range(1,n+1):
 for j in range(1,m+1):d[i,j]=cost[i-1,j-1]+min(d[i-1,j-1],d[i-1,j]+.035,d[i,j-1]+.035)
i,j=n,m;links=[]
while i>0 and j>0:
 links.append((i-1,j-1));v=[d[i-1,j-1],d[i-1,j]+.035,d[i,j-1]+.035];k=int(np.argmin(v));i-=k!=2;j-=k!=1
mapping=np.array([np.mean([b for a,b in links if a==i]) for i in range(n)])
mapping=np.maximum.accumulate(np.rint(gaussian_filter1d(mapping,.5)).astype(int))
raw=out+'.raw.mp4';writer=cv2.VideoWriter(raw,cv2.VideoWriter_fourcc(*'mp4v'),rate,(B[0].shape[1],B[0].shape[0]))
for j in mapping:writer.write(B[min(m-1,max(0,j))])
writer.release();subprocess.run(['ffmpeg','-y','-i',raw,'-c:v','libx264','-crf','17','-pix_fmt','yuv420p',out,'-loglevel','error'],check=True)
json.dump({'source':generated,'reference':ref,'frame_indices':mapping.tolist(),'mean_pose_distance':float(cost[np.arange(n),mapping].mean()),'unchanged_frame_ratio':float((np.diff(mapping)==0).mean()),'note':'Only time mapping is applied; every output frame comes wholly from the generated video.'},open(out+'.json','w'),indent=2)
