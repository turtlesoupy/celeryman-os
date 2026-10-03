import cv2,numpy as np,subprocess,os,json
src='reference/celery-man.mp4'
os.makedirs('public/media/motion',exist_ok=True)
def clip(name,start,end,crop):
 out=f'public/media/motion/{name}.mp4'
 subprocess.run(['ffmpeg','-y','-ss',str(start),'-i',src,'-t',str(end-start),'-an','-vf',f'crop={crop},scale=-2:720','-c:v','libx264','-crf','16',out,'-loglevel','error'],check=True)
 subprocess.run(['ffmpeg','-y','-i',out,'-frames:v','1',f'public/media/motion/{name}.png','-loglevel','error'],check=True)
# Coordinates describe only video pixels inside the original window.
clip('celery',26.1,28.1,'532:868:1056:144')
clip('engaged',37.45,38.65,'532:868:1056:144')
clip('oyster',42.65,45.1,'910:668:882:242')
# Track the front window horizontally during the squat cascade.
cap=cv2.VideoCapture(src);fps=cap.get(cv2.CAP_PROP_FPS);cap.set(cv2.CAP_PROP_POS_FRAMES,round(69.6*fps))
writer=cv2.VideoWriter('analysis/squat-track.mp4',cv2.VideoWriter_fourcc(*'mp4v'),fps,(540,800))
for i in range(round(1.4*fps)):
 ok,f=cap.read()
 if not ok:break
 hsv=cv2.cvtColor(f,cv2.COLOR_BGR2HSV);indices=np.flatnonzero((hsv[700,:,1]<45)&(hsv[700,:,2]>165));right=int(indices[-1]);left=right-548
 writer.write(cv2.resize(f[220:1020,left:left+540],(540,800)))
cap.release();writer.release()
subprocess.run(['ffmpeg','-y','-i','analysis/squat-track.mp4','-c:v','libx264','-crf','16','public/media/motion/tayne.mp4','-loglevel','error'],check=True)
subprocess.run(['ffmpeg','-y','-i','public/media/motion/tayne.mp4','-frames:v','1','public/media/motion/tayne.png','-loglevel','error'],check=True)
clip('flarhgunnstow',77.25,78.7,'530:866:132:146')
# Track the front pink portrait window as the sketch cascades/resizes it.
cap=cv2.VideoCapture(src);fps=cap.get(cv2.CAP_PROP_FPS);cap.set(cv2.CAP_PROP_POS_MSEC,73250)
writer=cv2.VideoWriter('analysis/hat-track.mp4',cv2.VideoWriter_fourcc(*'mp4v'),fps,(640,432));boxes=[]
for i in range(round(1.55*fps)):
 ok,frame=cap.read()
 if not ok:break
 hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
 mask=cv2.inRange(hsv,np.array([138,80,110]),np.array([175,255,255]))
 n,labels,stats,cent=cv2.connectedComponentsWithStats(mask)
 options=[]
 for x,y,w,h,area in stats[1:]:
  if x<650 or w<50 or h<90:continue
  for x2,y2,w2,h2,area2 in stats[1:]:
   rw=x2+w2-x;rh=max(h,h2)
   if x2>x+w+40 and abs(y-y2)<6 and 1.35<rw/rh<1.65:
    options.append((-abs(rw/rh-1.48),x,min(y,y2),rw,rh))
 if options:
  _,x,y,w,h=max(options)
  boxes.append([int(x),int(y),int(w),int(h)])
 elif boxes:x,y,w,h=boxes[-1]
 else:continue
 writer.write(cv2.resize(frame[y:y+h,x:x+w],(640,432)))
cap.release();writer.release();json.dump(boxes,open('analysis/hat-track.json','w'))
subprocess.run(['ffmpeg','-y','-i','analysis/hat-track.mp4','-c:v','libx264','-crf','16','public/media/motion/hat.mp4','-loglevel','error'],check=True)
subprocess.run(['ffmpeg','-y','-i','public/media/motion/hat.mp4','-frames:v','1','public/media/motion/hat.png','-loglevel','error'],check=True)
# Motion APIs require >=3 second references. Repeat the actual short motion, without invented interpolation.
for name in ['celery','engaged','oyster','tayne','flarhgunnstow','hat']:
 subprocess.run(['ffmpeg','-y','-stream_loop','-1','-i',f'public/media/motion/{name}.mp4','-t','5','-c:v','libx264','-crf','16',f'public/media/motion/{name}-5s.mp4','-loglevel','error'],check=True)
