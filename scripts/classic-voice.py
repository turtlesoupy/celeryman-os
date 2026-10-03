"""Fit classic system TTS to one calibration phrase; reuse frozen settings on holdouts.
This is parameter/spectral fitting, not neural speaker cloning.
"""
import json, subprocess, sys, pathlib, tempfile
import numpy as np
from scipy import signal

def run(args): return subprocess.check_output(args, stderr=subprocess.DEVNULL)
def read(path): return np.frombuffer(run(['ffmpeg','-v','error','-i',str(path),'-ar','24000','-ac','1','-f','f32le','-']),np.float32)
def active(x):
 e=np.sqrt(np.convolve(x*x,np.ones(480)/480,'same')); ix=np.flatnonzero(e>max(e.max()*.07,.001))
 return x[max(0,ix[0]-240):min(len(x),ix[-1]+240)] if len(ix) else x

def pitch(x):
 values=[]
 for i in range(0,len(x)-960,240):
  y=x[i:i+960]; y=y-y.mean()
  if np.sqrt(np.mean(y*y))<.01:continue
  a=signal.correlate(y,y,method='fft')[959:]; k=60+np.argmax(a[60:400])
  if a[k]/max(a[0],1e-10)>.55:values.append(24000/k)
 return float(np.median(values)) if values else 130.

def synth(voice,rate,text,out):
 # Remove speech-control syntax from user text; parameters are supplied by us only.
 text=text.replace('[','').replace(']','')
 run(['say','-v',voice,'-r',str(round(rate)),'-o',str(out),'--data-format=LEI16@24000',text])

def filters(p):
 ratio=p['pitchRatio']; fs=[f'asetrate={24000*ratio}', 'aresample=24000',f'atempo={1/ratio}']
 fs += [f'equalizer=f={hz}:t=o:w=1:g={gain}' for hz,gain in p['eq']]
 fs += [f"volume={p['gain']}", 'alimiter=limit=0.95:level=false:latency=true']
 return ','.join(fs)

def render(p,text,out):
 with tempfile.TemporaryDirectory() as d:
  raw=pathlib.Path(d)/'raw.wav';synth(p['voice'],p['rate'],text,raw)
  run(['ffmpeg','-y','-v','error','-i',str(raw),'-af',filters(p),'-ar','24000','-ac','1','-c:a','pcm_s16le',str(out)])

if __name__=='__main__':
 mode=sys.argv[1]
 if mode=='render':
  p=json.loads(pathlib.Path(sys.argv[2]).read_text()); render(p,sys.argv[3],sys.argv[4])
 elif mode=='fit':
  dest=pathlib.Path('public/voice-lab/audio');dest.mkdir(parents=True,exist_ok=True)
  ref=active(read('public/media/original/greeting.wav')); target=pitch(ref)
  for voice in ['Fred','Ralph','Albert','Zarvox','Junior','Alex']:
   try:
    raw=dest/f'{voice}-raw.wav';text='Good morning Paul. What will your first sequence of the day be?'
    synth(voice,180,text,raw); x=active(read(raw)); rate=180*len(x)/len(ref)
    synth(voice,rate,text,raw);x=active(read(raw));ratio=float(np.clip(target/pitch(x),.65,1.55))
    p={'voice':voice,'rate':round(rate),'pitchRatio':ratio,'eq':[],'gain':1,'calibrationText':text,'method':'Classic system voice fitted to greeting only; frozen pitch, pace and 6-band EQ. Not neural cloning.'}
    mid=dest/f'{voice}-fit.wav';render(p,text,mid);y=active(read(mid))
    f,a=signal.welch(ref,24000,nperseg=1024);_,b=signal.welch(y,24000,nperseg=1024)
    a/=max(a.sum(),1e-10);b/=max(b.sum(),1e-10)
    for hz in [160,315,630,1250,2500,5000]:
     band=(f>hz/1.414)&(f<hz*1.414);gain=float(np.clip(10*np.log10((a[band].sum()+1e-10)/(b[band].sum()+1e-10)),-8,8));p['eq'].append([hz,round(gain,2)])
    render(p,text,mid);y=active(read(mid));p['gain']=float(np.clip(np.sqrt(np.mean(ref*ref)/np.mean(y*y)),.2,5))
    render(p,text,mid)
    pathlib.Path(f'benchmarks/voice-lab/classic-{voice}.json').write_text(json.dumps(p,indent=2));print(voice,'rate',p['rate'],'pitch',round(ratio,2),flush=True)
   except subprocess.CalledProcessError:print('Unavailable:',voice,flush=True)
