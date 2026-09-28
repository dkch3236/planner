"""Prepare transparent sprite sheets using Pillow and the Python standard library.

Usage: python scripts/prepare_assets.py --input path/to/assets.zip
See scripts/ASSETS.md for grouping, sizing and reproducibility details.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw, ImageFilter, features

ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTENSIONS = {'.png', '.webp', '.jpg', '.jpeg', '.tif', '.tiff'}


def connected_components(alpha: Image.Image):
    """8-connected nonzero-alpha runs. Return exact bounds, area and row runs."""
    width, height = alpha.size
    pixels = alpha.tobytes()
    parents, runs, previous = [], [], []

    def find(n):
        while parents[n] != n:
            parents[n] = parents[parents[n]]
            n = parents[n]
        return n

    for y in range(height):
        row = pixels[y * width:(y + 1) * width]
        current = []
        # Regex matches nonzero bytes in C; alpha=1 is retained, not thresholded away.
        for match in re.finditer(b'[^\x00]+', row):
            left, right = match.span()
            label = len(parents)
            parents.append(label)
            current.append((left, right, label))
            runs.append((y, left, right, label))
        j = 0
        for left, right, label in current:
            while j < len(previous) and previous[j][1] < left:
                j += 1
            k = j
            while k < len(previous) and previous[k][0] <= right:
                parents[find(previous[k][2])] = find(label)
                k += 1
        previous = current
    groups = {}
    for y, left, right, label in runs:
        root = find(label)
        if root not in groups:
            groups[root] = {'bbox': [left, y, right, y + 1], 'area': 0, 'runs': []}
        g = groups[root]
        b = g['bbox']
        b[0], b[1], b[2], b[3] = min(b[0], left), min(b[1], y), max(b[2], right), y + 1
        g['area'] += right - left
        g['runs'].append((y, left, right))
    return list(groups.values())


def union_bounds(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes)]


def empty_cuts(alpha, box, axis, minimum_gap):
    """Only fully transparent strips qualify as separators."""
    crop = alpha.crop(box)
    occupied = list(crop.getprojection()[axis])
    cuts = []
    start = None
    for i, value in enumerate(occupied + [True]):
        if not value and start is None:
            start = i
        elif value and start is not None:
            if start > 0 and i < len(occupied) and i - start >= minimum_gap:
                cuts.append((start, i))
            start = None
    origin = box[axis]
    return [(origin + a, origin + b) for a, b in cuts]


def split_boxes(alpha, minimum_gap, row_first=True):
    """Recursive whitespace partitioning keeps nearby detached decorations together."""
    initial = alpha.getbbox()
    if initial is None:
        return []

    def visit(box, depth=0):
        axes = [1, 0] if row_first else [0, 1]
        for axis in axes:
            cuts = empty_cuts(alpha, box, axis, minimum_gap)
            if not cuts:
                continue
            edges = [box[axis]] + [(a + b) // 2 for a, b in cuts] + [box[axis + 2]]
            result = []
            for a, b in zip(edges, edges[1:]):
                part = list(box)
                part[axis], part[axis + 2] = a, b
                local = alpha.crop(part).getbbox()
                if local:
                    tight = [part[0] + local[0], part[1] + local[1],
                             part[0] + local[2], part[1] + local[3]]
                    result.extend(visit(tight, depth + 1))
            return result
        return [list(box)]
    return sorted(visit(initial), key=lambda b: (b[1], b[0]))


def read_sources(source):
    if source.is_dir():
        for path in sorted(source.rglob('*')):
            if path.suffix.lower() in IMAGE_EXTENSIONS:
                yield path.relative_to(source).as_posix(), path.read_bytes()
    else:
        with ZipFile(source) as archive:
            # Read members directly. No extraction and no archive path traversal.
            for info in sorted(archive.infolist(), key=lambda x: x.filename):
                if not info.is_dir() and Path(info.filename).suffix.lower() in IMAGE_EXTENSIONS:
                    yield info.filename, archive.read(info)


def slug(value):
    return re.sub(r'[^a-z0-9]+', '_', value.lower()).strip('_') or 'asset'


def analyze(source):
    for name, raw in read_sources(source):
        image = Image.open(io.BytesIO(raw)).convert('RGBA')
        alpha = image.getchannel('A')
        components = connected_components(alpha)
        gaps = [8, 12, 16, 24]
        print(json.dumps({'source': name, 'size': image.size, 'bounds': alpha.getbbox(),
            'components': len(components), 'large_components': sum(c['area'] >= 16 for c in components),
            'whitespace_groups': {g: len(split_boxes(alpha, g)) for g in gaps}}, ensure_ascii=False))


def distance(a, b):
    dx = max(a[0] - b[2], b[0] - a[2], 0)
    dy = max(a[1] - b[3], b[1] - a[3], 0)
    return math.hypot(dx, dy)


def group_components(components, gap):
    parents = list(range(len(components)))
    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    # Only attach a small satellite to a nearby larger object; no chain merging.
    for i, satellite in enumerate(components):
        if satellite['area'] > 160:
            continue
        neighbors = [(distance(satellite['bbox'], anchor['bbox']), j)
                     for j, anchor in enumerate(components)
                     if anchor['area'] >= max(400, satellite['area'] * 8)]
        if neighbors:
            separation, j = min(neighbors)
            if separation <= gap:
                parents[i] = j
    groups = {}
    for i, c in enumerate(components):
        groups.setdefault(find(i), []).append(c)
    return [union_bounds([c['bbox'] for c in group]) for group in groups.values()]


def clean_support(alpha, threshold, minimum_area):
    binary = alpha.point(lambda v: 255 if v > threshold else 0)
    components = connected_components(binary)
    keep = [c for c in components if c['area'] >= minimum_area]
    mask = Image.new('L', alpha.size)
    draw = ImageDraw.Draw(mask)
    for component in keep:
        for y, left, right in component['runs']:
            draw.line((left, y, right - 1, y), fill=255)
    return mask, keep, len(components) - len(keep)


def padded(box, size, margin=2):
    return [max(0, box[0] - margin), max(0, box[1] - margin),
            min(size[0], box[2] + margin), min(size[1], box[3] + margin)]


def region_boxes(support, rule):
    """Layout guides prevent fragile borders from becoming individual line fragments.

    Bounds within each guide are still found from alpha, not fixed crop dimensions.
    Guides use a reference image size so the same layout also works at other scales.
    """
    rw, rh = rule['reference_size']
    result = []
    for region in rule['regions']:
        a, b, c, d = region['box']
        box = [round(a * support.width / rw), round(b * support.height / rh),
               round(c * support.width / rw), round(d * support.height / rh)]
        local = support.crop(box)
        tight = local.getbbox()
        if not tight:
            continue
        if region['mode'] == 'single':
            pieces = [tight]
        elif region['mode'] == 'components':
            pieces = group_components(connected_components(local), 6 * support.width / rw)
        else:
            cuts = empty_cuts(local, tight, 1, max(2, round(4 * support.height / rh)))
            edges = [tight[1]] + [(a+b)//2 for a,b in cuts] + [tight[3]]
            pieces = []
            for top, bottom in zip(edges, edges[1:]):
                bound = local.crop((0, top, local.width, bottom)).getbbox()
                if bound:
                    pieces.append([bound[0], top+bound[1], bound[2], top+bound[3]])
        result.extend([[box[0]+p[0], box[1]+p[1], box[0]+p[2], box[1]+p[3]] for p in pieces])
    return result


def category_for(stem, width, height):
    ratio = width / height
    family = stem.split('_')[0]
    if family == 'character':
        return 'characters', 'character'
    if family in {'growth', 'level', 'rest'}:
        return 'illustrations', family
    if max(width, height) <= 80 and 0.7 <= ratio <= 1.43:
        return 'icons', 'icon'
    if 'border' in stem or ratio >= 4:
        return 'borders', 'border'
    if stem.startswith('icons'):
        return 'icons', 'icon'
    if stem == 'tapes':
        return 'tapes', 'tape'
    if 'stamp' in stem and 0.6 <= ratio <= 0.95 and height < 220:
        return 'stamps', 'stamp'
    return 'decorations', 'decoration'


def standard_canvas(category, stem, width, height):
    """Choose physical pixels, then fit uniformly. Never stretch either axis."""
    if category == 'icons':
        side = min((32, 48, 64), key=lambda n: abs(n - max(width, height)))
        return side, side
    if category == 'characters' or stem.startswith('rest'):
        return 512, 512
    if stem.startswith(('growth', 'level')):
        return 256, 256
    longest = max(width, height)
    standards = (32, 48, 64, 96, 128, 192, 256, 384, 512)
    side = min(standards, key=lambda n: abs(n - longest))
    if 0.8 <= width / height <= 1.25 and category != 'borders':
        return side, side
    # Rectangles retain their aspect; round the short side up to a multiple of 8.
    if width >= height:
        return side, max(8, math.ceil(side * height / width / 8) * 8)
    return max(8, math.ceil(side * width / height / 8) * 8), side


def normalize(crop, canvas_size):
    width, height = canvas_size
    scale = min(width / crop.width, height / crop.height)
    size = max(1, round(crop.width * scale)), max(1, round(crop.height * scale))
    # Pillow's RGBA resize premultiplies alpha internally for correct edge filtering.
    resized = crop.resize(size, Image.Resampling.LANCZOS)
    result = Image.new('RGBA', canvas_size)
    offset = (width - size[0]) // 2, (height - size[1]) // 2
    result.paste(resized, offset)  # no second alpha multiplication
    return result, size, offset


def checker(size, step=12):
    result = Image.new('RGB', size, '#f4f1e9')
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2:
                draw.rectangle((x, y, x + step - 1, y + step - 1), fill='#e3dfd5')
    return result


def process(args):
    if not features.check('webp'):
        raise RuntimeError('This Pillow installation lacks WebP support.')
    config = json.loads(args.config.read_text(encoding='utf-8'))
    output, report = args.output.resolve(), args.report.resolve()
    output.mkdir(parents=True, exist_ok=True)
    report.mkdir(parents=True, exist_ok=True)
    previews = report / 'sheets'
    previews.mkdir(exist_ok=True)
    old_manifest = output / 'manifest.json'
    owned = set()
    previous_manifest = {}
    if old_manifest.exists():
        previous_manifest = json.loads(old_manifest.read_text(encoding='utf-8'))
        owned = {r['path'] for r in previous_manifest['assets']}
    imported_assets = [a for a in previous_manifest.get('assets', []) if a.get('import_batch')]
    imported_paths = {a['path'] for a in imported_assets}
    from asset_review import load_review, apply_review
    source_data = dict(read_sources(args.input))
    policy = None if args.strict_alpha else load_review(Path(__file__).with_name('asset_review.json'), source_data)
    assets, sources, review = [], [], []
    generated_paths = set()
    for name, raw in source_data.items():
        stem = slug(Path(name).stem)
        with Image.open(io.BytesIO(raw)) as original:
            if original.mode not in {'RGBA', 'LA', 'P'} and 'transparency' not in original.info:
                raise ValueError(f'{name}: missing alpha. Supply a transparent source.')
            rgba = original.convert('RGBA')
        alpha = rgba.getchannel('A')
        if alpha.getextrema()[0] > 0:
            raise ValueError(f'{name}: no fully transparent pixels.')
        rule = dict(config['defaults'])
        for pattern, override in config['rules'].items():
            if re.search(pattern, stem):
                rule.update(override)
        if args.strict_alpha:
            rule.update(alpha_threshold=0, min_component_area=1, grouping='components', gap=0)
        support, components, discarded = clean_support(alpha, rule['alpha_threshold'], rule['min_component_area'])
        if not components:
            sources.append({'source': name, 'warning': 'No foreground found.'})
            continue
        method = rule['grouping']
        gap = rule['gap'] * rgba.width / 1536
        if args.strict_alpha:
            components.sort(key=lambda c: (c['bbox'][1], c['bbox'][0]))
            boxes = [c['bbox'] for c in components]
        elif method == 'single':
            boxes = [list(support.getbbox())]
        elif method == 'regions':
            boxes = region_boxes(support, rule)
        elif method == 'whitespace':
            boxes = split_boxes(support, max(2, round(gap)))
        else:
            boxes = group_components(components, gap)
        boxes = sorted(boxes, key=lambda b: (b[1] // max(1, rule.get('reading_row_height', 1)), b[0], b[1]))
        # Retain original alpha inside a two-pixel fringe around detected objects.
        # This preserves soft edges, but removes the low-alpha background contamination.
        support_fringe = support if args.strict_alpha else support.filter(ImageFilter.MaxFilter(5))
        clean_alpha = Image.composite(alpha, Image.new('L', alpha.size), support_fringe)
        rgba.putalpha(clean_alpha)
        overlay = checker(rgba.size)
        overlay.paste(rgba, (0, 0), rgba)
        draw = ImageDraw.Draw(overlay)
        source_info = {'source': name, 'sha256': hashlib.sha256(raw).hexdigest(),
            'original_size': list(rgba.size), 'alpha_threshold': rule['alpha_threshold'],
            'grouping': method, 'component_count': len(components), 'discarded_noise_components': discarded,
            'slice_count': len(boxes)}
        sources.append(source_info)
        for index, core in enumerate(boxes, 1):
            box = padded(core, rgba.size, 0 if args.strict_alpha else 2)
            crop = rgba.crop(box)
            # Isolate a component group from neighbors whose bounding boxes overlap.
            if method == 'components':
                group_mask = Image.new('L', rgba.size)
                pen = ImageDraw.Draw(group_mask)
                for c in ([components[index-1]] if args.strict_alpha else components):
                    b = c['bbox']
                    if b[0] >= core[0] and b[1] >= core[1] and b[2] <= core[2] and b[3] <= core[3]:
                        for y, left, right in c['runs']:
                            pen.line((left, y, right - 1, y), fill=255)
                local_mask = group_mask.crop(box)
                if not args.strict_alpha:
                    local_mask = local_mask.filter(ImageFilter.MaxFilter(5))
                crop.putalpha(Image.composite(crop.getchannel('A'), Image.new('L', crop.size), local_mask))
            category, prefix = category_for(stem, *crop.size)
            canvas = standard_canvas(category, stem, *crop.size)
            normalized, resized, offset = normalize(crop, canvas)
            folder = category + (f'/{canvas[0]}' if category == 'icons' else '')
            filename = f'{prefix}_{stem}_{index:03d}.webp'
            relative = folder + '/' + filename
            if relative in generated_paths:
                raise ValueError(f'Duplicate output name from multiple sources: {relative}')
            generated_paths.add(relative)
            target = output / relative
            if relative in imported_paths:
                raise FileExistsError(f'Generated asset conflicts with imported asset: {relative}')
            if target.exists() and relative not in owned:
                raise FileExistsError(f'Refusing to overwrite an unmanaged file: {target}')
            target.parent.mkdir(parents=True, exist_ok=True)
            normalized.save(target, 'WEBP', lossless=True, method=6, exact=True)
            with Image.open(target) as decoded:
                decoded = decoded.convert('RGBA')
                if decoded.size != normalized.size or decoded.tobytes() != normalized.tobytes():
                    raise AssertionError(f'WebP round-trip mismatch: {relative}')
                if not decoded.getchannel('A').getbbox():
                    raise AssertionError(f'Empty output: {relative}')
            asset = {'path': relative, 'source': name, 'source_index': index, 'source_bbox': box,
                'original_crop_size': list(crop.size), 'canvas_size': list(canvas),
                'content_size': list(resized), 'center_offset': list(offset), 'category': category,
                'bytes': target.stat().st_size}
            assets.append(asset)
            if min(crop.size) < 8 or max(crop.size) > rgba.width * .65 and method != 'single':
                review.append({'path': relative, 'reason': 'Very small or unusually large group; inspect sheet overlay.'})
            if stem == 'tapes_stamps_stickers' and crop.width > 380 * rgba.width / 1536:
                review.append({'path': relative, 'reason': 'Possible touching paper illustrations: alpha cannot recover obscured boundaries.'})
            if stem == 'corners_borders' and core[1] > rgba.height * .8 and crop.width > rgba.width * .28:
                review.append({'path': relative, 'reason': 'Connected landscape strip retained intact; check whether several motifs should be separated manually.'})
            draw.rectangle(tuple(box), outline='#d1374c', width=2)
            draw.rectangle((box[0], box[1], box[0] + 32, box[1] + 13), fill='#ffffff')
            draw.text((box[0] + 1, box[1]), str(index), fill='#000000')
        overlay.thumbnail((1536, 1536))
        overlay.save(previews / f'{stem}.jpg', quality=92)
        print(f'{name}: {len(boxes)} assets ({len(components)} components)', flush=True)
    decisions = []
    if policy:
        assets, decisions = apply_review(policy, source_data, assets, output, owned)
        affected = {d['path'] for d in decisions}
        review = [r for r in review if r['path'] not in affected]
    assets.extend(imported_assets)
    sources.extend(s for s in previous_manifest.get('sources', []) if s.get('import_batch'))
    from name_icons import apply_icon_names
    icon_name_mapping = {} if args.strict_alpha else apply_icon_names(assets, output, owned)
    for item in review:
        item['path'] = icon_name_mapping.get(item['path'], item['path'])
    stale = sorted((owned | generated_paths) - {a['path'] for a in assets})
    # Only remove old products listed in our previous manifest, never source files
    # or unrelated project assets. Resolve and verify each individual target.
    for relative in stale:
        target = (output / relative).resolve()
        if target.is_relative_to(output) and target.suffix == '.webp' and target.is_file():
            target.unlink()
    manifest = {'version': 1, 'input': str(args.input.resolve()), 'config': config,
        'strict_alpha': args.strict_alpha,
        'asset_count': len(assets), 'categories': dict(Counter(a['category'] for a in assets)),
        'sources': sources, 'assets': assets, 'review': review,
        'removed_stale_generated_files': stale, 'review_decisions': decisions,
        'imports': previous_manifest.get('imports', {}), 'icon_name_mapping': icon_name_mapping}
    old_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    make_catalog(assets, output, report, review)
    print(json.dumps({'assets': len(assets), 'categories': manifest['categories'],
        'review_count': len(review), 'output': str(output)}, ensure_ascii=False), flush=True)


def make_catalog(assets, output, report, review):
    import html
    import os
    cards = []
    flagged = {r['path'] for r in review}
    for a in assets:
        path = os.path.relpath(output / a['path'], report).replace('\\', '/')
        title = html.escape(a['path'])
        warning = '<p style="color:#a52925">검토 필요: 작은 조각 또는 맞닿은 그림</p>' if a['path'] in flagged else ''
        cards.append(f'<article data-category="{a["category"]}"><div class="preview"><img src="{html.escape(path)}" loading="lazy"></div><b>{title}</b><p>{a["original_crop_size"]} → {a["canvas_size"]}</p>{warning}<small>{html.escape(a["source"])}</small></article>')
    document = '''<!doctype html><html lang="ko"><meta charset="utf-8"><title>Asset catalog</title>
<style>body{font:14px system-ui;margin:24px;background:#f4f5f7;color:#24282b}header{position:sticky;top:0;background:#f4f5f7;padding:12px;z-index:1}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}article{background:white;border:1px solid #ddd;padding:12px;border-radius:8px;overflow-wrap:anywhere}.preview{height:150px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#e4e0d6 0% 25%,#f6f3eb 0% 50%) 0/20px 20px}.preview img{max-width:100%;max-height:145px;object-fit:contain}b{display:block;margin-top:10px;font-size:12px}small{color:#666}</style>
<header><h1>개발용 에셋 검수</h1><p>원본 크기 → 출력 캔버스. 체커 무늬는 투명 영역입니다.</p><input id="search" placeholder="파일명 / 종류 검색" oninput="document.querySelectorAll('article').forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(this.value.toLowerCase()))"></header><main>'''
    (report / 'catalog.html').write_text(document + ''.join(cards) + '</main></html>', encoding='utf-8')
    for category in sorted({a['category'] for a in assets}):
        subset = [a for a in assets if a['category'] == category]
        for page in range(math.ceil(len(subset) / 60)):
            items = subset[page * 60:(page + 1) * 60]
            sheet = Image.new('RGB', (1200, math.ceil(len(items) / 6) * 150), '#ffffff')
            draw = ImageDraw.Draw(sheet)
            for i, a in enumerate(items):
                x, y = i % 6 * 200, i // 6 * 150
                tile = checker((196, 118))
                with Image.open(output / a['path']) as im:
                    im = im.convert('RGBA')
                    im.thumbnail((188, 112), Image.Resampling.LANCZOS)
                    tile.paste(im, ((196-im.width)//2, (118-im.height)//2), im)
                sheet.paste(tile, (x, y))
                draw.text((x+3, y+120), Path(a['path']).stem[-30:], fill='#222222')
                draw.text((x+3, y+134), f'{a["canvas_size"][0]}x{a["canvas_size"][1]}', fill='#555555')
            sheet.save(report / f'contact_{category}_{page + 1}.jpg', quality=92)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path.home() / 'Downloads' / 'assets.zip')
    parser.add_argument('--analyze', action='store_true')
    parser.add_argument('--strict-alpha', action='store_true', help='Literal alpha>0 components; disable cleanup and semantic grouping.')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/assets')
    parser.add_argument('--report', type=Path, default=ROOT / 'reports/assets')
    parser.add_argument('--config', type=Path, default=Path(__file__).with_name('asset_rules.json'))
    args = parser.parse_args()
    if args.analyze:
        analyze(args.input)
    else:
        process(args)


if __name__ == '__main__':
    main()
