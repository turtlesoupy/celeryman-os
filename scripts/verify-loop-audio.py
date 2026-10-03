import json,subprocess,numpy as np
from pathlib import Path
out=[]
for name in ['celery','oyster','generated']:
 p=Path('benchmarks/responsiveness')/('loop-'+name+'.webm')
 data=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-ac','1','-ar','48000','-'])
 x=np.frombuffer(data,np.float32)[2400:-2400]
 # A browser seek/dropout creates a run of effectively zero output. Musical
 # quiet sections in these source tracks still have a measurable noise floor.
 rms=np.sqrt(np.mean(x[:len(x)//480*480].reshape(-1,480)**2,axis=1))
 silent=rms<1e-5;longest=run=0
 for s in silent:
  run=run+1 if s else 0;longest=max(longest,run)
 out.append(dict(track=name,duration_seconds=len(x)/48000,minimum_10ms_rms=float(rms.min()),longest_silent_ms=longest*10,pass_check=longest<2))
Path('benchmarks/responsiveness/loop-audio.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
assert all(r['pass_check'] for r in out)
