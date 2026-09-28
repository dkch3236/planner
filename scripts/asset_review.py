"""Persistent, source-fingerprinted human review decisions for the asset pipeline."""
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


def load_review(path, source_data):
    policy = json.loads(path.read_text(encoding='utf-8'))
    for name, spec in policy['sources'].items():
        if name not in source_data or hashlib.sha256(source_data[name]).hexdigest() != spec['sha256']:
            raise ValueError(f'Review source changed: {name}. Recheck coordinates before exporting.')
    return policy


def reviewed_crop(original, spec):
    from prepare_assets import connected_components
    box = spec['box']
    crop = original.crop(box)
    alpha = crop.getchannel('A')
    if spec.get('polygon'):
        mask = Image.new('L', crop.size)
        ImageDraw.Draw(mask).polygon([(x-box[0], y-box[1]) for x,y in spec['polygon']], fill=255)
        alpha = Image.composite(alpha, Image.new('L', crop.size), mask)
    for rect in spec.get('erase', []):
        x0,y0,x1,y1 = rect
        ImageDraw.Draw(alpha).rectangle((x0-box[0], y0-box[1], x1-box[0]-1, y1-box[1]-1), fill=0)
    binary = alpha.point(lambda v: 255 if v > spec.get('threshold', 16) else 0)
    components = connected_components(binary)
    if not components:
        raise ValueError('Review crop has no foreground')
    if spec.get('largest'):
        components = [max(components, key=lambda c: c['area'])]
    else:
        components = [c for c in components if c['area'] >= 10]
    mask = Image.new('L', crop.size)
    draw = ImageDraw.Draw(mask)
    for c in components:
        for y,left,right in c['runs']:
            draw.line((left,y,right-1,y), fill=255)
    mask = mask.filter(ImageFilter.MaxFilter(5))
    crop.putalpha(Image.composite(alpha, Image.new('L', crop.size), mask))
    return crop


def apply_review(policy, source_data, assets, output, owned):
    from prepare_assets import normalize, standard_canvas, slug
    # Fail on missing/renumbered targets instead of silently ignoring a decision.
    lookup = {(a['source'], a['source_index']): a for a in assets}
    for name, source in policy['sources'].items():
        for index in source.get('delete', []) + [int(i) for i in source.get('edit', {})]:
            if (name, index) not in lookup:
                raise ValueError(f'Missing reviewed asset: {name} #{index}')
        for index, edit in source.get('edit', {}).items():
            if lookup[name, int(index)]['source_bbox'] != edit['expected_box']:
                raise ValueError(f'Reviewed source coordinates changed: {name} #{index}')
    result, decisions = [], []
    for asset in assets:
        source = policy['sources'].get(asset['source'], {})
        index = str(asset['source_index'])
        if asset['source_index'] in source.get('delete', []):
            decisions.append({'action': 'delete', 'path': asset['path']})
            continue
        edit = source.get('edit', {}).get(index)
        if not edit:
            result.append(asset)
            continue
        if asset['source_bbox'] != edit['expected_box']:
            raise ValueError(f'Slicing rule changed reviewed bounds: {asset["path"]}')
        original = Image.open(io.BytesIO(source_data[asset['source']])).convert('RGBA')
        paths = []
        for spec in edit['outputs']:
            crop = reviewed_crop(original, spec)
            relative = spec.get('path', asset['path'])
            target = (output / relative).resolve()
            if not target.is_relative_to(output) or target.suffix != '.webp':
                raise ValueError(f'Invalid review output: {relative}')
            if target.exists() and relative != asset['path'] and relative not in owned:
                raise FileExistsError(f'Unmanaged review output: {relative}')
            category = relative.split('/')[0]
            canvas = spec.get('canvas') or standard_canvas(category, slug(Path(asset['source']).stem), *crop.size)
            normalized, size, offset = normalize(crop, canvas)
            target.parent.mkdir(parents=True, exist_ok=True)
            normalized.save(target, 'WEBP', lossless=True, method=6, exact=True)
            with Image.open(target) as decoded:
                if decoded.convert('RGBA').tobytes() != normalized.tobytes():
                    raise AssertionError(f'Review round trip failed: {relative}')
            result.append({**asset, 'path': relative, 'source_bbox': spec['box'],
                           'original_crop_size': list(crop.size), 'canvas_size': list(canvas),
                           'content_size': list(size), 'center_offset': list(offset),
                           'category': category, 'bytes': target.stat().st_size,
                           'reviewed': True, 'replaces': asset['path']})
            paths.append(relative)
        decisions.append({'action': 'correct', 'path': asset['path'], 'outputs': paths})
    return result, decisions
