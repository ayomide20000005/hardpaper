from PIL import Image, ImageDraw
import math

def draw_hardpaper_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    padding = size * 0.05
    draw.ellipse([padding, padding, size-padding, size-padding], fill='#1a1a1a')
    
    cx, cy = size/2, size/2
    r = size * 0.38
    points = []
    for i in range(6):
        angle = math.radians(90 + i * 60)
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        points.append((x, y))
    draw.polygon(points, fill='#9d7dff')
    
    r2 = size * 0.24
    inner = []
    for i in range(6):
        angle = math.radians(90 + i * 60)
        x = cx + r2 * math.cos(angle)
        y = cy + r2 * math.sin(angle)
        inner.append((x, y))
    draw.polygon(inner, fill='#1a1a1a')
    
    r3 = size * 0.08
    draw.ellipse([cx-r3, cy-r3, cx+r3, cy+r3], fill='#9d7dff')
    
    return img

img256 = draw_hardpaper_icon(256)
img48 = draw_hardpaper_icon(48)
img32 = draw_hardpaper_icon(32)
img16 = draw_hardpaper_icon(16)

img256.save(
    'build/icon.ico',
    format='ICO',
    sizes=[(256,256),(48,48),(32,32),(16,16)],
    append_images=[img48, img32, img16]
)
print("Icon generated at build/icon.ico")