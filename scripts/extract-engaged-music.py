# The post-"4d3d3d3 engaged" track only plays cleanly for half a bar before Paul starts typing.
# Cut one bar from the first kick after the power-up sweep and replace the typing clicks' highs
# (>900 Hz) with the same spot one 2-beat cycle earlier; the bass and kick stay untouched.
import subprocess,numpy as np,scipy.io.wavfile as w,scipy.signal as sg
T0,start,beat=37.9,38.239,0.5137
raw=subprocess.run(['ffmpeg','-ss',str(T0),'-t','2.6','-i','reference/celery-man.mp4','-vn','-ac','2','-ar','44100','-f','s16le','-loglevel','error','-'],check=True,capture_output=True).stdout
sr=44100;x=np.frombuffer(raw,np.int16).reshape(-1,2).astype(float)/32768
i0=int(round((start-T0)*sr));n=int(round(4*beat*sr));lag=int(round(2*beat*sr))
lo=sg.sosfiltfilt(sg.butter(4,900,'lp',fs=sr,output='sos'),x,axis=0);hi=x-lo
fr=int(.005*sr);m=len(x)//fr*fr;E=np.sqrt(np.mean(hi.mean(1)[:m].reshape(-1,fr)**2,axis=1))
lagf=lag//fr;a,b=(i0+lag)//fr,min((i0+n)//fr+4,len(E))
ratio=np.ones_like(E);ratio[lagf:]=(E[lagf:]+1e-5)/(E[:-lagf]+1e-5)
mask=np.zeros(len(E),bool)
for k in range(a,b):
 if ratio[k]>1.8:mask[max(k-2,a):k+12]=True
g=np.repeat(mask.astype(float),fr);g=np.pad(g,(0,len(x)-len(g)))
win=np.hanning(2*int(.004*sr)+1);g=np.convolve(g,win/win.sum(),'same')[:,None]
prior=np.zeros_like(hi);prior[lag:]=hi[:-lag]
y=(lo+hi*(1-g)+prior*g)[i0:i0+n]
w.write('public/media/original/music-engaged.wav',sr,(np.clip(y,-1,1)*32767).astype(np.int16))
