import numpy as np
from PIL import Image
from typing import List
import os.path

hidden_text = np.asarray(Image.open(os.path.join(__file__, "../text.png")).convert('L'), dtype=np.float32) / 255

rs = np.random.RandomState(1005)

nb_frames = 40
skip = 1
scale = 6
img_shape = (hidden_text.shape[0]*scale, hidden_text.shape[1]*scale, 3)
print(img_shape)

all_pixels = rs.normal(0, 0.07, (hidden_text.shape[0] + (nb_frames - 1) * skip, hidden_text.shape[1])).clip(-1, 1)
all_pixels[(nb_frames-1)*skip:, :] = all_pixels[:hidden_text.shape[0], :]

frames: List[Image.Image] = []
for frame_nb in range(nb_frames):
    pixels = all_pixels[frame_nb*skip:frame_nb*skip+hidden_text.shape[0]]
    pixels_red_green = np.ones(img_shape)
    for y in range(pixels.shape[0]):
        for x in range(pixels.shape[1]):
            pixval = pixels[y, x]
            # pixval = x / pixels.shape[1] * 2 - 1
            hidden_text_weight = pow(1 - hidden_text[y, x], 0.5)
            if frame_nb > 0:
                pixval = pixval * hidden_text_weight + all_pixels[y, x] * (1 - hidden_text_weight)
            power = 0.43
            pixval = np.sign(pixval) * pow(abs(pixval), power)
            # pixval = hidden_text_weight
            if pixval < 0:
                pixels_red_green[y*scale:(y+1)*scale, x*scale:(x+1)*scale, 1:3] = 1 + pixval
            else:
                pixels_red_green[y*scale:(y+1)*scale, x*scale:(x+1)*scale, 0:3:2] = 1 - pixval

    pixels_red_green = (pixels_red_green * 255).astype(np.uint8)
    img = Image.fromarray(pixels_red_green, 'RGB')
    frames.append(img)

frames[0].save(os.path.join(__file__, "../../cover.gif"), save_all=True, append_images=frames[1:], duration=1000//30, loop=0)
