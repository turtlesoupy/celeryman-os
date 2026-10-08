"""Create aligned shot/contact-sheet reviews without modifying the videos."""
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/thomas-intro-20261006'
TIMES = [0.5, 2.5, 4.5, 6.7, 7.0, 7.3, 7.6, 8.0, 8.6, 9.3, 9.8, 10.8]
VIDEOS = [('Original', OUT / 'original-intro.mp4')]
VIDEOS += [(label, OUT / name) for label, name in [
    ('Happy Horse', 'thomas-intro-happy-horse-raw.mp4'),
    ('PixVerse', 'thomas-intro-pixverse-raw.mp4'),
] if (OUT / name).exists()]

with TemporaryDirectory() as tmp:
    for label, video in VIDEOS:
        sheet = Image.new('RGB', (1920, 3 * 296), '#17191d')
        draw = ImageDraw.Draw(sheet)
        for i, t in enumerate(TIMES):
            frame = Path(tmp) / 'frame.jpg'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                            '-ss', str(t), '-i', str(video), '-frames:v', '1',
                            '-vf', 'scale=480:270', str(frame)], check=True)
            x, y = (i % 4) * 480, (i // 4) * 296
            sheet.paste(Image.open(frame), (x, y))
            draw.text((x + 8, y + 275), f'{label} / {t:.2f}s', fill='white')
        output = OUT / f'{label.lower().replace(" ", "-")}-review.jpg'
        sheet.save(output, quality=94)
        print(output)
