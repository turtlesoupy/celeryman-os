import subprocess,numpy as np,scipy.signal as ss,json
from pathlib import Path
def audio(p):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-ar','12000','-ac','1','-f','f32le','-']),np.float32).astype(np.float64)
record=audio('benchmarks/timed-live/output-audio.webm');report=json.load(open('benchmarks/timed-live/report.json')); rows=[]
for e in report['events']+[{'kind':'audio-playing','src':'/media/original/intro.wav','spokenText':'Tayne introduction, original dialogue in generated video'}]:
 if e['kind']!='audio-playing' or not e['src'].startswith('/media/original/'):continue
 target=audio('public'+e['src']);corr=ss.correlate(record,target,mode='valid',method='fft');power=np.r_[0,np.cumsum(record**2)];window_power=np.maximum(0,power[len(target):]-power[:-len(target)]);energy=np.sqrt(window_power*sum(target**2));score=np.where(window_power>sum(target**2)*.0001,corr/np.maximum(energy,1e-12),0);score=np.clip(score,-1,1);i=int(np.argmax(score));rows.append({'phrase':e.get('spokenText',e.get('text','')),'source':e['src'],'best_correlation':round(float(score[i]),5),'output_time_s':round(i/12000,3),'duration_s':len(target)/12000,'pass':bool(score[i]>.8)})
Path('benchmarks/final-output-audio.json').write_text(json.dumps({'method':'Normalized waveform cross-correlation against actual browser output, including Opus compression and concurrent music. Threshold 0.8 verifies source audio is audible; not a perceptual clone score.','checks':rows,'pass':all(r['pass'] for r in rows)},indent=2));print(json.dumps(rows,indent=2))
