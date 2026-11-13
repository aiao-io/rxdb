# 首页分层素材生成提示词

执行方式：imagegen fallback CLI；模型：gpt-image-2.5；quality: high；size: 1536x1024。

模型先根据原图局部重建独立主体，随后移除临时色键背景并输出真实 RGBA 透明 PNG。

## 中景：灯泡、光环、悬浮图标

Use-case: background-extraction.
Edit the attached crop of an existing illustration to isolate its middle illustration layer for a layered website hero. Preserve the original toy-like 3D voxel/clay art, shapes, pastel pink/lavender and vivid blue palette, soft lighting, camera angle, and relative sizes of the included objects.
KEEP ONLY: the large luminous golden-yellow voxel light bulb with its white four-point star and purple metal base, its complete tilted pink-violet orbit ring, the two floating rounded square photo/image tiles on the left, the floating purple video clapperboard on the upper right, the pink-purple music-note tile on the right, and a small number of the original floating pastel cubes. Keep the bulb clearly larger than the tiles and preserve the arrangement around it. Restore any cropped outline so that all included objects are complete. Provide clear empty gaps between the separate objects and through the orbit ring.
REMOVE COMPLETELY: the seated boy, his backpack, every part of the platform/machine/ground, all sky and clouds, all navigation, text, avatar/search symbols, UI cards or controls. Do not introduce extra objects or typography.
COMPOSITION: center the entire isolated group in a 1536x1024 landscape canvas, use about 88 percent of its width, keep at least 45 pixels of empty margin on every side, no element cut off.
TECHNICAL BACKDROP: every pixel outside the isolated objects, including all open gaps between them and the empty center of the orbit ring, must be one perfectly uniform flat pure chroma green #00FF00. No green lighting, no green reflection on objects, no floor, no cast shadow on the backdrop, no fog, no backdrop gradient, no checkerboard. Keep the object edges sharp enough for clean background removal. This green is only a temporary removable key color.

## 人物：人物与平台

Use-case: background-extraction; identity-preserve.
Edit the attached crop of an existing illustration to isolate the boy and the voxel platform that he sits on as one complete foreground scene for a layered website hero. Preserve the original boy exactly in identity, friendly square pixel face, dark hair, backwards red/blue cap, red hoodie, gray/blue backpack, dark trousers, oversized white and blue shoes, seated pose with both feet dangling in front, right hand resting on the platform and left arm pointing diagonally up-left. Retain the soft tactile 3D voxel/clay illustration aesthetic, proportions, camera angle, bright blue/lavender/white material colors, and warm soft studio lighting.
KEEP: the boy together with the white/lavender/blue stepped voxel pedestal and retro media-machine platform that supports him, including the blue display with its white pixel play symbol, small warm-yellow indicator, a few cyan glowing details and subtle little gold/purple blocks. Make the scene a single self-contained floating stepped platform with a complete natural bottom silhouette, reconstruct the tiny bottom parts hidden by the original UI crop, maintain the original front-facing three-quarter perspective and recognizable platform design. The boy is seated on the upper right of the platform and must remain clearly recognizable at useful size.
REMOVE COMPLETELY: the yellow light bulb and its ring, all floating image/music/video tiles, all sky, clouds, horizon, UI cards, all text, logos and interface controls. No new characters or extra objects.
COMPOSITION: center the whole boy-and-platform scene in a 1536x1024 landscape canvas, fill about 85 percent of the width, leave 50 pixels of clear margin on all sides, show all shoes and all fingers and the full platform; do not cut off any piece.
TECHNICAL BACKDROP: every pixel outside the scene, including every opening between the fingers/arms and platform blocks, must be one perfectly uniform flat pure chroma green #00FF00. No green lighting or reflection, no ground surface, no cast shadow on the backdrop, no atmospheric haze, no backdrop gradient, no checkerboard. Green is only a removable key background. Preserve antialiased silhouette edges.
