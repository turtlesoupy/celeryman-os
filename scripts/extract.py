import subprocess,json,os
os.makedirs('public/media/original',exist_ok=True)
source='reference/celery-man.mp4'
def run(args): subprocess.run(['ffmpeg','-y','-i',source]+args+['-loglevel','error'],check=True)
clips={
 'celery':(20.5,3.1,'crop=540:880:1050:138'),
 'celery-face':(22,1.6,'crop=672:452:286:248'),
 'oyster':(42.15,1.7,'crop=912:674:878:238'),
 'oyster-face':(42.2,1.6,'crop=540:452:290:248'),
 'tayne':(77.15,1.6,'crop=540:880:125:138'),
 'tayne-intro':(59.2,3.55,'crop=540:880:974:138'),
 'hat':(73.4,1.05,'crop=640:410:1250:230'),
 'flarhgunnstow':(76.8,2.1,'crop=540:880:125:138'),
 'tayne-squat':(69.5,1.5,'crop=540:880:875:138'),
}
for name,(start,duration,crop) in clips.items():
 run(['-ss',str(start),'-t',str(duration),'-an','-vf',crop+',scale=-2:600','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',f'public/media/original/{name}.mp4'])
 run(['-ss',str(start+.3),'-frames:v','1','-vf',crop,f'public/media/original/{name}.png'])
audio={
 'greeting':(12.35,4.15),'yes-paul':(18.55,.85),'engaged':(36.45,1.70),'print':(47.90,.65),'yes':(49.93,.58),'beta':(52.25,3.45),'okay':(58.02,.58),'intro':(59.35,3.7),'hat':(73.31,.48),'flower':(75.20,.58),'repeat':(79.78,1.86),'nsfw':(83.67,2.87),'confirm':(87.15,.62),'call':(94.13,3.42),
 'music-chaos':(100.8,6.8),'music-celery':(20.5,3.1),'music-tayne':(64.7,1.55),'music-oyster':(42.25,2.55),'keyboard':(39.15,.9)
}
for name,(start,duration) in audio.items(): run(['-ss',str(start),'-t',str(duration),'-vn','-acodec','pcm_s16le',f'public/media/original/{name}.wav'])
json.dump({'clips':clips,'audio':audio},open('analysis/extraction-manifest.json','w'),indent=2)
