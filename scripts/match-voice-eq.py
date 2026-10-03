import numpy as np,scipy.signal as ss,scipy.ndimage as nd,subprocess,sys
from scipy.io import wavfile
ref,source,out=sys.argv[1:]
def read(f):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',f,'-f','f32le','-ar','24000','-ac','1','-']),np.float32)
a,b=read(ref),read(source)
def spectrum(x):
 f,t,z=ss.stft(x,24000,nperseg=1024,noverlap=512);p=np.abs(z)**2;active=p.sum(axis=0)>np.percentile(p.sum(axis=0),30);return f,np.sqrt(np.mean(p[:,active],axis=1))
f,pa=spectrum(a);_,pb=spectrum(b)
pa/=np.linalg.norm(pa);pb/=np.linalg.norm(pb)
gain=np.exp(nd.gaussian_filter1d(np.log((pa+1e-7)/(pb+1e-7)),10));gain=np.clip(gain,.4,2.5)
taps=ss.firwin2(513,f/12000,gain);c=ss.fftconvolve(b,taps,mode='same');c*=min(.97/max(abs(c)),np.sqrt(np.mean(a*a))/np.sqrt(np.mean(c*c)))
wavfile.write(out,24000,(np.clip(c,-1,1)*32767).astype(np.int16))
