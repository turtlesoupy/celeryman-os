import json, subprocess, pathlib
import numpy as np
from scipy import signal
p=pathlib.Path('benchmarks/voice-lab/desktop-hd-verification.json');r=json.loads(p.read_text())
def read(file):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',file,'-ar','24000','-ac','1','-f','f32le','-']),np.float32)
a=read('benchmarks/voice-lab/desktop-hd-stream.webm');b=read('public'+r['url']);corr=signal.correlate(a,b,method='fft');offset=int(np.argmax(corr))-(len(b)-1);left=max(0,offset);right=min(len(a),offset+len(b));aa=a[left:right];bb=b[left-offset:right-offset];similarity=float(np.dot(aa,bb)/(np.linalg.norm(aa)*np.linalg.norm(bb)))
e=np.array([np.sqrt(np.mean(b[i:i+240]**2)) for i in range(0,len(b)-240,240)]);last=(int(np.flatnonzero(e>.002)[-1])+1)*240;tail=bool(offset+last<=len(a));r['captureVerification']={'reference':r['url'],'waveformCorrelation':similarity,'alignmentOffsetMs':offset/24,'recordedDuration':len(a)/24000,'generatedDuration':len(b)/24000,'audibleTailCaptured':tail,'pass':similarity>.9 and tail,'captureNote':'MediaRecorder may omit initial wall-clock silence; recording offsets are not latency measurements. Browser audio-playing latency is reported separately.'};p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r['captureVerification'],indent=2));assert r['captureVerification']['pass']
