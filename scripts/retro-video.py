import subprocess,sys,os,json
source,out,reference=sys.argv[1:]
probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_streams','-of','json',reference]))['streams'][0]
w,h=probe['width'],probe['height']
# Render the whole generated performance in the reference viewport's aspect ratio.
# No identity layers, masks, face replacement, or compositing are involved.
filters=f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},scale=-2:360:flags=area,gblur=sigma=0.45,scale={w}:{h}:flags=bilinear,setsar=1'
subprocess.run(['ffmpeg','-y','-i',source,'-vf',filters,'-c:v','libx264','-crf','20','-c:a','aac','-movflags','+faststart',out,'-loglevel','error'],check=True)
