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

sizes = [16, 32, 48, 256]
images = [draw_hardpaper_icon(s) for s in sizes]

images[0].save(
    'build/icon.ico',
    format='ICO',
    sizes=[(s, s) for s in sizes],
    append_images=images[1:]
)
print("Icon generated at build/icon.ico")