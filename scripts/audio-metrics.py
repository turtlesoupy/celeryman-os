import numpy as np,scipy.signal as sig,scipy.fft as fft,subprocess,json,sys
def audio(p):
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',p,'-f','f32le','-ar','16000','-ac','1','-']);x=np.frombuffer(raw,np.float32);return x
def feature(x):
 _,_,z=sig.stft(x,16000,nperseg=512,noverlap=352);s=np.abs(z)**2
 mel=lambda hz:2595*np.log10(1+hz/700);hz=lambda m:700*(10**(m/2595)-1)
 edges=np.floor(hz(np.linspace(mel(60),mel(7600),42))/16000*512).astype(int);bank=np.zeros((40,257))
 for i in range(40):
  a,b,c=edges[i:i+3];bank[i,a:b]=np.linspace(0,1,b-a,endpoint=False);bank[i,b:c]=np.linspace(1,0,c-b,endpoint=False)
 mf=fft.dct(np.log(bank@s+1e-10),axis=0,norm='ortho')[1:14].T
 rms=np.sqrt(np.mean(np.lib.stride_tricks.sliding_window_view(x,512)[::160]**2,axis=1));return mf, float(np.sqrt(np.mean(x*x)))
ref=audio(sys.argv[1]);rf,rr=feature(ref);results=[]
for p in sys.argv[2:]:
 x=audio(p);f,r=feature(x);dist=np.sqrt(np.mean((rf[:,None,:]-f[None,:,:])**2,axis=2));dtw=np.full((len(rf)+1,len(f)+1),np.inf);dtw[0,0]=0
 for i in range(1,len(rf)+1):
  for j in range(1,len(f)+1):dtw[i,j]=dist[i-1,j-1]+min(dtw[i-1,j],dtw[i,j-1],dtw[i-1,j-1])
 results.append({'file':p,'duration_s':len(x)/16000,'reference_duration_s':len(ref)/16000,'rms_db':20*np.log10(r+1e-9),'mfcc_dtw_distance':float(dtw[-1,-1]/(len(rf)+len(f))),'note':'Lower MFCC distance is better; this is not a calibrated perceptual fidelity percentage.'})
print(json.dumps(results,indent=2))
