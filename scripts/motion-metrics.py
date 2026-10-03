import cv2,numpy as np,json,sys
cap=cv2.VideoCapture(sys.argv[1]);fps=cap.get(cv2.CAP_PROP_FPS);every=max(1,round(fps/6));frames=[];i=0
while True:
 ok,f=cap.read()
 if not ok:break
 if i%every==0:frames.append(cv2.resize(cv2.cvtColor(f,cv2.COLOR_BGR2GRAY),(180,240)))
 i+=1
cap.release();motion=[];feet=[]
for a,b in zip(frames,frames[1:]):
 flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,3,15,3,5,1.2,0);mag=np.linalg.norm(flow,axis=2);mask=(a<190)|(b<190)
 motion.append(float(np.mean(mag[mask])) if mask.any() else 0)
 low=mask[140:];feet.append(float(np.mean(mag[140:][low])) if low.any() else 0)
print(json.dumps({'frames_analyzed':len(frames),'mean_motion_px':float(np.mean(motion)),'lower_body_motion_px':float(np.mean(feet)),'p90_motion_px':float(np.percentile(motion,90)),'note':'Optical flow at 180x240 and 6 fps; validates movement, not semantic correctness.'}))
